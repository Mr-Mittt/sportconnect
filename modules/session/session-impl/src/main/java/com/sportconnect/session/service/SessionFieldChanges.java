package com.sportconnect.session.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.social.post.api.dto.SystemCode;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;

/**
 * SESSION-67: the diff behind "one system comment per changed field". Pure logic, no Spring: {@link #snapshot} takes the
 * editable fields of a session, and {@link #diff} compares two snapshots and returns one {@link Change} per field that
 * differs, in a fixed order (the order of the edit form).
 *
 * <p>Each change carries the stable {@link SystemCode}, its string params and an English {@code content} fallback. The
 * params are {@code name} (the editor, baked in at write time), {@code old} and {@code new}; an empty string means "no
 * value". The client picks the sentence from which side is empty (added, changed, removed) and from the field kind
 * (a free-text field reads "updated ... "new""); the English fallback uses the same four shapes. Two codes differ:
 * {@code SESSION_FEE_CHANGED} carries {@code oldFeeType}, {@code oldFeeAmountVnd}, {@code newFeeType} and
 * {@code newFeeAmountVnd} instead of {@code old}/{@code new}, and {@code SESSION_ATTRIBUTES_CHANGED} carries only
 * {@code name}.
 *
 * <p>Values are written as plain strings: location by name, the start as an ISO instant (the client formats it in the
 * viewer's zone), the duration in minutes, booleans as {@code true}/{@code false}, a cleared slot (stored {@code null}) or
 * {@code initialSlot} of 0 as empty. A start-only edit moves the end by the same amount, so the duration is unchanged
 * and only the start differs.
 */
final class SessionFieldChanges {

    /** One field that differs: the code, its params and the English fallback text. */
    record Change(SystemCode code, Map<String, String> params, String content) {}

    /** The editable fields of a session at one moment. {@code attributes} is never null (null counts as empty). */
    record Snapshot(String title, Long locationId, String locationNote, Instant start, Instant end, Integer capacity,
                    FeeType feeType, Long feeAmountVnd, String feeNote, Boolean autoApprove, Integer initialSlot,
                    Integer maleSlots, Integer femaleSlots, Integer gameMood, JsonNode attributes) {}

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final DateTimeFormatter UTC_TEXT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'").withZone(ZoneOffset.UTC);

    /** Numbers compare by value ({@code 1} equals {@code 1.0}: a map read back from jsonb can differ in type only). */
    private static final Comparator<JsonNode> NUMERIC_AWARE = (a, b) -> {
        if (a.isNumber() && b.isNumber()) {
            return a.decimalValue().compareTo(b.decimalValue());
        }
        return a.equals(b) ? 0 : 1;
    };

    private SessionFieldChanges() {}

    static Snapshot snapshot(Session s) {
        JsonNode attributes = s.getAttributes() == null || s.getAttributes().isEmpty()
                ? MAPPER.createObjectNode() : MAPPER.valueToTree(s.getAttributes());
        return new Snapshot(s.getTitle(), s.getLocationId(), s.getLocationNote(), s.getScheduledStart(),
                s.getScheduledEndAt(), s.getCapacity(), s.getFeeType(), s.getFeeAmountVnd(), s.getFeeNote(),
                s.getAutoApprove(), s.getInitialSlot(), s.getMaleSlots(), s.getFemaleSlots(), s.getGameMood(), attributes);
    }

    /**
     * @param editorName called once, and only when at least one field changed
     * @param locationNames called once, and only when the location changed: the names of the old and the new location
     */
    static List<Change> diff(Snapshot before, Snapshot after, Supplier<String> editorName,
                             Supplier<Map<Long, LocationResponse>> locationNames) {
        List<Draft> drafts = new ArrayList<>();

        text(drafts, SystemCode.SESSION_TITLE_CHANGED, "title", before.title(), after.title());
        if (!Objects.equals(before.locationId(), after.locationId())) {
            Map<Long, LocationResponse> names = locationNames.get();
            value(drafts, SystemCode.SESSION_LOCATION_CHANGED, "location",
                    locationName(names, before.locationId()), locationName(names, after.locationId()));
        }
        text(drafts, SystemCode.SESSION_LOCATION_NOTE_CHANGED, "location note", before.locationNote(), after.locationNote());
        value(drafts, SystemCode.SESSION_START_CHANGED, "start time",
                instant(before.start()), instant(after.start()), UTC_TEXT, null);
        Long oldMinutes = minutes(before);
        Long newMinutes = minutes(after);
        value(drafts, SystemCode.SESSION_DURATION_CHANGED, "duration",
                number(oldMinutes), number(newMinutes), null, " minutes");
        value(drafts, SystemCode.SESSION_CAPACITY_CHANGED, "capacity",
                number(before.capacity()), number(after.capacity()));
        fee(drafts, before, after);
        text(drafts, SystemCode.SESSION_FEE_NOTE_CHANGED, "fee note", before.feeNote(), after.feeNote());
        value(drafts, SystemCode.SESSION_AUTO_APPROVE_CHANGED, "auto approval",
                String.valueOf(before.autoApprove()), String.valueOf(after.autoApprove()),
                null, null, true);
        value(drafts, SystemCode.SESSION_INITIAL_SLOT_CHANGED, "initial slots",
                positive(before.initialSlot()), positive(after.initialSlot()));
        value(drafts, SystemCode.SESSION_MALE_SLOTS_CHANGED, "male slots",
                positive(before.maleSlots()), positive(after.maleSlots()));
        value(drafts, SystemCode.SESSION_FEMALE_SLOTS_CHANGED, "female slots",
                positive(before.femaleSlots()), positive(after.femaleSlots()));
        value(drafts, SystemCode.SESSION_GAME_MOOD_CHANGED, "game mood",
                number(before.gameMood()), number(after.gameMood()));
        if (!before.attributes().equals(NUMERIC_AWARE, after.attributes())) {
            drafts.add(Draft.attributes());
        }

        if (drafts.isEmpty()) {
            return List.of();
        }
        String name = editorName.get();
        List<Change> changes = new ArrayList<>(drafts.size());
        for (Draft d : drafts) {
            changes.add(d.build(name));
        }
        return changes;
    }

    // ---- per-field drafts ----------------------------------------------------------------------------------------

    private static void text(List<Draft> out, SystemCode code, String label, String before, String after) {
        String oldText = blankToEmpty(before);
        String newText = blankToEmpty(after);
        if (!oldText.equals(newText)) {
            out.add(new Draft(code, label, true, oldText, newText, oldText, newText, null));
        }
    }

    private static void value(List<Draft> out, SystemCode code, String label, String oldValue, String newValue) {
        value(out, code, label, oldValue, newValue, null, null);
    }

    private static void value(List<Draft> out, SystemCode code, String label, String oldValue,
                              String newValue, DateTimeFormatter instantFormat, String unit) {
        value(out, code, label, oldValue, newValue, instantFormat, unit, false);
    }

    /** {@code onOff}: the English fallback reads {@code true}/{@code false} as "on"/"off". */
    private static void value(List<Draft> out, SystemCode code, String label, String oldValue,
                              String newValue, DateTimeFormatter instantFormat, String unit, boolean onOff) {
        if (oldValue.equals(newValue)) {
            return;
        }
        out.add(new Draft(code, label, false, oldValue, newValue,
                shown(oldValue, instantFormat, unit, onOff), shown(newValue, instantFormat, unit, onOff), null));
    }

    private static void fee(List<Draft> out, Snapshot before, Snapshot after) {
        String oldAmount = before.feeType() == FeeType.FIXED ? number(before.feeAmountVnd()) : "";
        String newAmount = after.feeType() == FeeType.FIXED ? number(after.feeAmountVnd()) : "";
        String oldType = before.feeType() == null ? "" : before.feeType().name();
        String newType = after.feeType() == null ? "" : after.feeType().name();
        if (oldType.equals(newType) && oldAmount.equals(newAmount)) {
            return;
        }
        Map<String, String> params = new LinkedHashMap<>();
        params.put("oldFeeType", oldType);
        params.put("oldFeeAmountVnd", oldAmount);
        params.put("newFeeType", newType);
        params.put("newFeeAmountVnd", newAmount);
        out.add(new Draft(SystemCode.SESSION_FEE_CHANGED, "fee", false, oldType, newType,
                feeText(oldType, oldAmount), feeText(newType, newAmount), params));
    }

    // ---- value formatting ----------------------------------------------------------------------------------------

    private static String feeText(String type, String amount) {
        return switch (type) {
            case "FREE" -> "Free";
            case "SPLIT" -> "Split";
            case "FIXED" -> amount + " VND";
            default -> "";
        };
    }

    private static String shown(String value, DateTimeFormatter instantFormat, String unit, boolean onOff) {
        if (value.isEmpty()) {
            return "";
        }
        if (instantFormat != null) {
            return instantFormat.format(Instant.parse(value));
        }
        if (onOff) {
            return Boolean.parseBoolean(value) ? "on" : "off";
        }
        return unit == null ? value : value + unit;
    }

    private static String locationName(Map<Long, LocationResponse> names, Long id) {
        if (id == null) {
            return "";
        }
        LocationResponse location = names == null ? null : names.get(id);
        return location == null || location.getName() == null ? "" : location.getName();
    }

    private static Long minutes(Snapshot s) {
        return s.end() == null ? null : Duration.between(s.start(), s.end()).toMinutes();
    }

    private static String instant(Instant i) {
        return i == null ? "" : i.toString();
    }

    private static String number(Number n) {
        return n == null ? "" : String.valueOf(n);
    }

    /** Slots: null and 0 both mean "nothing". */
    private static String positive(Integer n) {
        return n == null || n == 0 ? "" : String.valueOf(n);
    }

    private static String blankToEmpty(String s) {
        return s == null || s.isBlank() ? "" : s.trim();
    }

    /** A change before the editor's name is known. {@code params == null}: the standard {@code old}/{@code new} pair. */
    private record Draft(SystemCode code, String label, boolean text, String oldParam, String newParam,
                         String oldShown, String newShown, Map<String, String> params) {

        static Draft attributes() {
            return new Draft(SystemCode.SESSION_ATTRIBUTES_CHANGED, null, false, "", "", "", "", Map.of());
        }

        Change build(String name) {
            Map<String, String> out = new LinkedHashMap<>();
            out.put("name", name);
            if (code == SystemCode.SESSION_ATTRIBUTES_CHANGED) {
                return new Change(code, out, name + " updated the sport details");
            }
            if (params != null) {
                out.putAll(params);
            } else {
                out.put("old", oldParam);
                out.put("new", newParam);
            }
            return new Change(code, out, content(name));
        }

        private String content(String name) {
            if (oldShown.isEmpty()) {
                return name + " added the " + label + " \"" + newShown + "\"";
            }
            if (newShown.isEmpty()) {
                return name + " removed the " + label;
            }
            if (text) {
                return name + " updated the " + label + " \"" + newShown + "\"";
            }
            return name + " changed the " + label + " from \"" + oldShown + "\" to \"" + newShown + "\"";
        }
    }
}
