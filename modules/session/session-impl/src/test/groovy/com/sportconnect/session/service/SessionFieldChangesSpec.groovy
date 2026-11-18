package com.sportconnect.session.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.session.api.dto.FeeType
import com.sportconnect.session.entity.Session
import com.sportconnect.social.post.api.dto.SystemCode
import spock.lang.Specification

import java.time.Instant

/** SESSION-67: the per-field diff behind the system comments of a host edit. */
class SessionFieldChangesSpec extends Specification {

    static final Instant START = Instant.parse('2026-11-20T11:00:00Z')
    static final ObjectMapper MAPPER = new ObjectMapper()

    /** A snapshot with defaults; pass only what the case changes. */
    static SessionFieldChanges.Snapshot snap(Map o = [:]) {
        def d = [title: 'Friday run', locationId: 1L, locationNote: null, start: START, end: START.plusSeconds(3600),
                 capacity: 10, feeType: FeeType.FREE, feeAmountVnd: null, feeNote: null, autoApprove: false,
                 isPublic: true, initialSlot: 0, maleSlots: null, femaleSlots: null, gameMood: 5, attributes: [:]] + o
        new SessionFieldChanges.Snapshot(d.title, d.locationId, d.locationNote, d.start, d.end, d.capacity,
                d.feeType, d.feeAmountVnd, d.feeNote, d.autoApprove, d.isPublic, d.initialSlot, d.maleSlots, d.femaleSlots,
                d.gameMood, MAPPER.valueToTree(d.attributes))
    }

    int editorCalls
    int locationCalls

    List<SessionFieldChanges.Change> diff(Map before, Map after, Map<Long, String> names = [:]) {
        editorCalls = 0
        locationCalls = 0
        SessionFieldChanges.diff(snap(before), snap(after),
                { editorCalls++; 'Alex' },
                { locationCalls++; names.collectEntries { id, n -> [(id): LocationResponse.builder().id(id).name(n).build()] } })
    }

    def "a free-text field reads added, updated or removed, never 'from X to Y'"() {
        when:
        def changes = diff([(field): before], [(field): after])

        then:
        changes.size() == 1
        changes[0].code == code
        changes[0].params == [name: 'Alex', old: oldParam, new: newParam]
        changes[0].content == content

        where:
        field          | before        | after         | code                                   | oldParam      | newParam      | content
        'title'        | null          | 'Friday run'  | SystemCode.SESSION_TITLE_CHANGED       | ''            | 'Friday run'  | 'Alex added the title "Friday run"'
        'title'        | 'Run'         | 'Friday run'  | SystemCode.SESSION_TITLE_CHANGED       | 'Run'         | 'Friday run'  | 'Alex updated the title "Friday run"'
        'title'        | 'Run'         | null          | SystemCode.SESSION_TITLE_CHANGED       | 'Run'         | ''            | 'Alex removed the title'
        'locationNote' | null          | 'Court 3'     | SystemCode.SESSION_LOCATION_NOTE_CHANGED | ''          | 'Court 3'     | 'Alex added the location note "Court 3"'
        'locationNote' | 'Court 3'     | 'Court 4'     | SystemCode.SESSION_LOCATION_NOTE_CHANGED | 'Court 3'   | 'Court 4'     | 'Alex updated the location note "Court 4"'
        'locationNote' | 'Court 3'     | null          | SystemCode.SESSION_LOCATION_NOTE_CHANGED | 'Court 3'   | ''            | 'Alex removed the location note'
        'feeNote'      | null          | 'Bring cash'  | SystemCode.SESSION_FEE_NOTE_CHANGED    | ''            | 'Bring cash'  | 'Alex added the fee note "Bring cash"'
        'feeNote'      | 'Cash'        | 'Bring cash'  | SystemCode.SESSION_FEE_NOTE_CHANGED    | 'Cash'        | 'Bring cash'  | 'Alex updated the fee note "Bring cash"'
        'feeNote'      | 'Cash'        | null          | SystemCode.SESSION_FEE_NOTE_CHANGED    | 'Cash'        | ''            | 'Alex removed the fee note'
    }

    def "a blank text counts as empty and an unchanged text writes nothing"() {
        expect:
        diff([feeNote: null], [feeNote: '   ']).isEmpty()
        diff([feeNote: 'Cash'], [feeNote: 'Cash']).isEmpty()
        diff([locationNote: ' Court 3 '], [locationNote: 'Court 3']).isEmpty()
    }

    def "any other field reads added, changed or removed with the old and new value"() {
        when:
        def changes = diff([(field): before], [(field): after])

        then:
        changes.size() == 1
        changes[0].code == code
        changes[0].params == [name: 'Alex', old: oldParam, new: newParam]
        changes[0].content == content

        where:
        field        | before | after | code                                      | oldParam | newParam | content
        'capacity'   | 10     | 20    | SystemCode.SESSION_CAPACITY_CHANGED       | '10'     | '20'     | 'Alex changed the capacity from "10" to "20"'
        'gameMood'   | 5      | 8     | SystemCode.SESSION_GAME_MOOD_CHANGED      | '5'      | '8'      | 'Alex changed the game mood from "5" to "8"'
        'initialSlot'| 0      | 2     | SystemCode.SESSION_INITIAL_SLOT_CHANGED   | ''       | '2'      | 'Alex added the initial slots "2"'
        'initialSlot'| 2      | 0     | SystemCode.SESSION_INITIAL_SLOT_CHANGED   | '2'      | ''       | 'Alex removed the initial slots'
        'maleSlots'  | null   | 3     | SystemCode.SESSION_MALE_SLOTS_CHANGED     | ''       | '3'      | 'Alex added the male slots "3"'
        'maleSlots'  | 3      | 4     | SystemCode.SESSION_MALE_SLOTS_CHANGED     | '3'      | '4'      | 'Alex changed the male slots from "3" to "4"'
        'femaleSlots'| 3      | null  | SystemCode.SESSION_FEMALE_SLOTS_CHANGED   | '3'      | ''       | 'Alex removed the female slots'
    }

    def "auto approval is written as true or false and read as on or off in the fallback"() {
        when:
        def changes = diff([autoApprove: false], [autoApprove: true])

        then:
        changes.size() == 1
        changes[0].code == SystemCode.SESSION_AUTO_APPROVE_CHANGED
        changes[0].params == [name: 'Alex', old: 'false', new: 'true']
        changes[0].content == 'Alex changed the auto approval from "off" to "on"'
    }

    def "visibility is written as public or private on both sides, and a missing value counts as public"() {
        when:
        def changes = diff([isPublic: before], [isPublic: after])

        then:
        changes.size() == 1
        changes[0].code == SystemCode.SESSION_VISIBILITY_CHANGED
        changes[0].params == [name: 'Alex', old: oldText, new: newText]
        changes[0].content == "Alex changed the visibility from \"${oldText}\" to \"${newText}\""

        where:
        before | after | oldText   | newText
        true   | false | 'public'  | 'private'
        false  | true  | 'private' | 'public'
        null   | false | 'public'  | 'private'
    }

    def "an unchanged visibility, or none against public, writes nothing"() {
        expect:
        diff([isPublic: before], [isPublic: after]).isEmpty()

        where:
        before | after
        true   | true
        false  | false
        null   | true
    }

    def "the fee carries the type and the amount on each side, in one comment"() {
        when:
        def changes = diff([feeType: oldType, feeAmountVnd: oldAmount], [feeType: newType, feeAmountVnd: newAmount])

        then:
        changes.size() == 1
        changes[0].code == SystemCode.SESSION_FEE_CHANGED
        changes[0].params == [name: 'Alex', oldFeeType: oldParams[0], oldFeeAmountVnd: oldParams[1],
                              newFeeType: newParams[0], newFeeAmountVnd: newParams[1]]
        changes[0].content == content

        where:
        oldType      | oldAmount | newType      | newAmount | oldParams        | newParams         | content
        FeeType.FREE | null      | FeeType.SPLIT| null      | ['FREE', '']     | ['SPLIT', '']     | 'Alex changed the fee from "Free" to "Split"'
        FeeType.FREE | null      | FeeType.FIXED| 50000L    | ['FREE', '']     | ['FIXED', '50000']| 'Alex changed the fee from "Free" to "50000 VND"'
        FeeType.FIXED| 50000L    | FeeType.FIXED| 60000L    | ['FIXED', '50000']| ['FIXED', '60000']| 'Alex changed the fee from "50000 VND" to "60000 VND"'
        FeeType.FIXED| 50000L    | FeeType.FREE | null      | ['FIXED', '50000']| ['FREE', '']     | 'Alex changed the fee from "50000 VND" to "Free"'
        null         | null      | FeeType.FREE | null      | ['', '']         | ['FREE', '']      | 'Alex added the fee "Free"'
    }

    def "a stale amount behind a non-FIXED fee type is not a change"() {
        expect:
        diff([feeType: FeeType.FREE, feeAmountVnd: 10L], [feeType: FeeType.FREE, feeAmountVnd: null]).isEmpty()
    }

    def "the start is an ISO instant, and a start-only edit that moves the end too writes only the start"() {
        given:
        def later = START.plusSeconds(3600)

        when: 'the end moved by the same amount, so the duration did not change'
        def changes = diff([start: START, end: START.plusSeconds(3600)], [start: later, end: later.plusSeconds(3600)])

        then:
        changes.size() == 1
        changes[0].code == SystemCode.SESSION_START_CHANGED
        changes[0].params == [name: 'Alex', old: '2026-11-20T11:00:00Z', new: '2026-11-20T12:00:00Z']
        changes[0].content == 'Alex changed the start time from "2026-11-20 11:00 UTC" to "2026-11-20 12:00 UTC"'
    }

    def "the duration is in minutes and is added when the session had no end"() {
        expect:
        with(diff([end: START.plusSeconds(3600)], [end: START.plusSeconds(5400)])) {
            size() == 1
            it[0].code == SystemCode.SESSION_DURATION_CHANGED
            it[0].params == [name: 'Alex', old: '60', new: '90']
            it[0].content == 'Alex changed the duration from "60 minutes" to "90 minutes"'
        }
        with(diff([end: null], [end: START.plusSeconds(5400)])) {
            size() == 1
            it[0].params == [name: 'Alex', old: '', new: '90']
            it[0].content == 'Alex added the duration "90 minutes"'
        }
    }

    def "a changed location is written by name, and both names come from one lookup"() {
        when:
        def changes = diff([locationId: 1L], [locationId: 2L], [1L: 'Court A', 2L: 'Court B'])

        then:
        locationCalls == 1
        changes.size() == 1
        changes[0].code == SystemCode.SESSION_LOCATION_CHANGED
        changes[0].params == [name: 'Alex', old: 'Court A', new: 'Court B']
        changes[0].content == 'Alex changed the location from "Court A" to "Court B"'
    }

    def "the location names are not looked up when the location did not change"() {
        when:
        diff([title: 'A'], [title: 'B'], [1L: 'Court A'])

        then:
        locationCalls == 0
    }

    def "attributes are one comment with no values, and a re-sent equal map writes nothing"() {
        expect:
        with(diff([attributes: ['balls': true]], [attributes: ['balls': false]])) {
            size() == 1
            it[0].code == SystemCode.SESSION_ATTRIBUTES_CHANGED
            it[0].params == [name: 'Alex']
            it[0].content == 'Alex updated the sport details'
        }
        diff([attributes: ['balls': true]], [attributes: ['balls': true]]).isEmpty()
        // jsonb hands back an Integer where the request carried a Double: same value, not a change
        diff([attributes: ['skill': 3]], [attributes: ['skill': 3.0d]]).isEmpty()
        diff([attributes: ['skill': 3]], [attributes: ['skill': 4]]).size() == 1
    }

    def "several fields give several comments in the order of the edit form, with one editor lookup"() {
        when:
        def changes = diff([title: 'Run', capacity: 10, gameMood: 5, feeType: FeeType.FREE],
                [title: 'Friday run', capacity: 12, gameMood: 7, feeType: FeeType.SPLIT])

        then:
        changes*.code == [SystemCode.SESSION_TITLE_CHANGED, SystemCode.SESSION_CAPACITY_CHANGED,
                          SystemCode.SESSION_FEE_CHANGED, SystemCode.SESSION_GAME_MOOD_CHANGED]
        changes.every { it.params.name == 'Alex' }
        editorCalls == 1
    }

    def "nothing changed writes nothing and never looks the editor up"() {
        when:
        def changes = diff([:], [:])

        then:
        changes.isEmpty()
        editorCalls == 0
        locationCalls == 0
    }

    def "snapshot reads the editable fields of a session, a null attribute map as empty"() {
        given:
        def session = Session.builder().title('T').locationId(4L).scheduledStart(START).scheduledEndAt(START.plusSeconds(60))
                .capacity(8).feeType(FeeType.FIXED).feeAmountVnd(1000L).feeNote('n').autoApprove(true).initialSlot(1)
                .maleSlots(2).femaleSlots(3).gameMood(9).build()

        when:
        def s = SessionFieldChanges.snapshot(session)

        then:
        s.title() == 'T'
        s.locationId() == 4L
        s.start() == START
        s.end() == START.plusSeconds(60)
        s.capacity() == 8
        s.feeType() == FeeType.FIXED
        s.feeAmountVnd() == 1000L
        s.feeNote() == 'n'
        s.autoApprove()
        s.initialSlot() == 1
        s.maleSlots() == 2
        s.femaleSlots() == 3
        s.gameMood() == 9
        s.attributes().isEmpty()
    }
}
