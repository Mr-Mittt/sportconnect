package com.sportconnect.sport.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.sport.api.dto.CreateUserSportProfileRequest;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.api.service.UserSportProfileService;
import com.sportconnect.sport.entity.UserSportProfile;
import com.sportconnect.sport.repository.UserSportProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserSportProfileServiceImpl implements UserSportProfileService {

    private static final int MAX_ATTRIBUTES_BYTES = 4096;

    private final UserSportProfileRepository profileRepository;
    private final SportService sportService;
    private final SportLookupCache sportLookupCache;
    private final ObjectMapper objectMapper;
    private final ProfileAttributeFilter attributeFilter;

    /**
     * Creates a new sport profile for the caller.
     *
     * <p>Verifies the sport exists and is currently active (A6 — a deactivated sport, e.g. one
     * turned off for this MVP's launch scope, can no longer be selected for a <em>new</em> profile;
     * an existing profile referencing a sport that's deactivated later is left in the table but
     * stops being returned, see {@link #getUserProfiles}), and rejects a duplicate
     * (userId, sportId) pair.
     *
     * <p>A7 removed the former max-3-active-profiles-per-user cap (user decision) — a product
     * limit with no technical driver.
     *
     * <p>A7 also made re-adding a previously deleted sport work. {@code deleteProfile} soft-deletes,
     * and {@code (user_id, sport_id)} is UNIQUE, so the old row both blocked a fresh insert and
     * satisfied the old unfiltered duplicate check — deleting a profile used to lock the user out of
     * that sport permanently. The row is now <strong>reactivated</strong> and repopulated entirely
     * from the request, so re-adding behaves like a first-time create that happens to keep its id.
     * Only a profile that is currently <em>active</em> is rejected as a duplicate.
     *
     * <p>A7 changed how the first of those is reported: a deactivated sport now throws
     * {@code ResourceNotFoundException} rather than {@code BadRequestException}, collapsing
     * "no such sport" and "sport switched off" into one outcome across every write path in the app
     * (see {@code SportService.requireActiveSportById}). The lookup is a single
     * {@code findByIdAndIsActiveTrue} query instead of a fetch followed by a flag check.
     *
     * <p>A20 forks here on {@code request.getIsResume()}: {@code true} routes to
     * {@link #resumeProfile} — a pure reactivation that keeps the soft-deleted row's scalar columns
     * and only prunes its {@code attributes} to the live schema, ignoring the rest of the request.
     * Absent / {@code false} keeps the A7 behaviour below unchanged.
     */
    @Override
    @Transactional
    public UserSportProfileResponse createProfile(UUID userId, CreateUserSportProfileRequest request) {
        // Verify the sport exists AND is active (A7): a deactivated sport throws the same
        // ResourceNotFoundException a missing one does - one check, not a fetch plus a flag test.
        // Routed through SportService so it reads SportLookupCache (A5) rather than the database,
        // the same reason getUserProfiles was routed that way.
        SportResponse sport = sportService.requireActiveSportById(request.getSportId());

        // A20: a resume is a pure reactivation of the soft-deleted row - none of the request's
        // scalar/attribute data is applied - so it takes a wholly separate path from the A7
        // create/repopulate logic below.
        if (Boolean.TRUE.equals(request.getIsResume())) {
            return resumeProfile(userId, request, sport);
        }

        // A9: keep only what the sport currently offers. Unknown keys, values of the wrong shape,
        // and writes aimed at a switched-off attribute are dropped silently rather than rejected -
        // see ProfileAttributeFilter for why this half is lenient while the admin schema write is
        // strict. Size is still enforced below and still fails loudly, because an oversized payload
        // has no sensible partial answer: deciding which keys to discard would be arbitrary.
        Map<String, Object> attributes = new HashMap<>(attributeFilter.filter(
                request.getAttributes(), sportService.getAttributeSchema(request.getSportId())));
        validateAttributesSize(attributes);

        // A7: a soft-deleted profile still occupies the (user_id, sport_id) pair, which carries a
        // UNIQUE constraint (V003) - so re-adding a sport has to revive that row, not insert a new
        // one, or it fails at the database. Before this, the duplicate check used the unfiltered
        // existsByUserIdAndSportId and rejected re-adds outright, which made deleteProfile a
        // one-way door: the user lost the profile and could never create it again.
        UserSportProfile existing = profileRepository.findByUserIdAndSportId(userId, request.getSportId())
                .orElse(null);
        if (existing != null) {
            if (Boolean.TRUE.equals(existing.getIsActive())) {
                throw new BadRequestException("User already has a profile for sport: " + sport.getName());
            }
            // Reactivation behaves like a fresh create that happens to reuse the row: every field
            // comes from the request, so a re-added profile never silently inherits values the user
            // last saved before deleting it. The id (and anything referencing it) is preserved.
            existing.setSkillLevel(request.getSkillLevel());
            existing.setYearsOfExperience(request.getYearsOfExperience());
            existing.setPreferredPosition(request.getPreferredPosition());
            existing.setBio(request.getBio());
            existing.setAttributes(attributes);
            existing.setIsActive(true);

            UserSportProfile reactivated = profileRepository.save(existing);
            log.info("Reactivated sport profile {} for user {} and sport {}",
                    reactivated.getId(), userId, sport.getName());
            return toUserSportProfileResponse(reactivated, sport.getName());
        }

        UserSportProfile profile = UserSportProfile.builder()
                .userId(userId)
                .sportId(request.getSportId())
                .skillLevel(request.getSkillLevel())
                .yearsOfExperience(request.getYearsOfExperience())
                .preferredPosition(request.getPreferredPosition())
                .bio(request.getBio())
                .attributes(attributes)
                .isActive(true)
                .build();

        UserSportProfile savedProfile = profileRepository.save(profile);
        log.info("Created sport profile for user {} and sport {}", userId, sport.getName());
        return toUserSportProfileResponse(savedProfile, sport.getName());
    }

    /**
     * A20: pure reactivation of the caller's soft-deleted profile for this sport, for the client's
     * "you had a profile here before — resume it" flow. Nothing from {@code request} is applied:
     *
     * <ul>
     *   <li>the stored scalar columns ({@code skillLevel}, {@code bio}, {@code preferredPosition},
     *       {@code yearsOfExperience}) are left exactly as they were before the soft delete;</li>
     *   <li>the stored {@code attributes} map is run through A10's {@link
     *       ProfileAttributeFilter#retainDefined} only — keys with no live definition are pruned,
     *       {@code isAvailable:false} values are kept verbatim, live values re-validated — with
     *       <em>no</em> merge of the request's attributes and no {@code null}-delete handling;</li>
     *   <li>{@code isActive} is flipped back to {@code true}.</li>
     * </ul>
     *
     * <p>Requires a soft-deleted row for {@code (userId, sportId)}: a missing row and a
     * currently-active row are both {@code BadRequestException} (the latter reusing A7's
     * active-duplicate message). The sport-active gate has already run in {@link #createProfile};
     * the size cap is re-checked on the pruned map for completeness, though a prune can only shrink
     * it.
     */
    private UserSportProfileResponse resumeProfile(UUID userId, CreateUserSportProfileRequest request,
                                                   SportResponse sport) {
        UserSportProfile existing = profileRepository
                .findByUserIdAndSportId(userId, request.getSportId())
                .orElseThrow(() -> new BadRequestException(
                        "No deactivated profile to resume for sport: " + sport.getName()));

        if (Boolean.TRUE.equals(existing.getIsActive())) {
            throw new BadRequestException("User already has a profile for sport: " + sport.getName());
        }

        SportAttributeSchema schema = sportService.getAttributeSchema(request.getSportId());
        Map<String, Object> pruned =
                new HashMap<>(attributeFilter.retainDefined(existing.getAttributes(), schema));
        validateAttributesSize(pruned);

        existing.setAttributes(pruned);
        existing.setIsActive(true);

        UserSportProfile resumed = profileRepository.save(existing);
        log.info("Resumed sport profile {} for user {} and sport {}",
                resumed.getId(), userId, sport.getName());
        return toUserSportProfileResponse(resumed, sport.getName());
    }

    @Override
    @Transactional(readOnly = true)
    public UserSportProfileResponse getProfileById(Long profileId) {
        // A7: active-scoped. The unfiltered findById returned soft-deleted profiles, so a profile
        // getUserProfiles omits was still reachable by id.
        UserSportProfile profile = profileRepository.findByIdAndIsActiveTrue(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "id", profileId));
        
        // A7: this is a GATE, not just a name lookup - requireActiveSportById throws when the sport is
        // deactivated, which is what keeps a profile under a dead sport unreachable individually
        // (getUserProfiles omits it). Do not "optimise" this into a batch/name-only lookup without
        // replacing the check. Cache-backed (A5) via SportService.
        SportResponse sport = sportService.requireActiveSportById(profile.getSportId());
        
        return toUserSportProfileResponse(profile, sport.getName());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Resolves sport names via {@link SportService#getActiveSportsByIds}, one batched call instead of
     * one per profile (A4 cleanliness fix). Routed through {@code SportService} rather than
     * {@code sportRepository} directly (A5) so this read path benefits from
     * {@code SportLookupCache} too, instead of hitting the database on every call. A4's original
     * note that this list "is bounded to ≤3 profiles by the max-3-profiles rule" no longer holds —
     * A7 removed that cap — so the batched lookup is now load-bearing rather than merely tidy.
     *
     * <p><strong>Profiles for a deactivated sport are omitted entirely</strong> (A7). Because
     * {@code getActiveSportsByIds} is backed by the active-only cache, an inactive sport simply is not in
     * the returned map, and a missing entry now means "drop this profile" rather than the old
     * {@code "Unknown"} placeholder name. A deactivated sport disappears from the app, and so does
     * anything hanging off it; the row is left in the table untouched, so reactivating the sport
     * brings the profile back exactly as it was.
     */
    @Override
    @Transactional(readOnly = true)
    public List<UserSportProfileResponse> getUserProfiles(UUID userId) {
        return getUserProfiles(userId, false);
    }

    /**
     * {@inheritDoc}
     *
     * <p>{@code includeInactive} only widens the <em>profile</em> query
     * ({@code findByUserId} vs {@code findByUserIdAndIsActiveTrue}); the dead-sport filter below is
     * unchanged, so a soft-deleted profile is returned only when its sport is still active (which is
     * also the only case A20's resume flow can act on). Each {@code UserSportProfileResponse}
     * carries {@code isActive}, so the caller distinguishes a resumable row from a live one.
     */
    @Override
    @Transactional(readOnly = true)
    public List<UserSportProfileResponse> getUserProfiles(UUID userId, boolean includeInactive) {
        List<UserSportProfile> profiles = includeInactive
                ? profileRepository.findByUserId(userId)
                : profileRepository.findByUserIdAndIsActiveTrue(userId);

        List<Long> sportIds = profiles.stream()
                .map(UserSportProfile::getSportId)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, SportResponse> sportsById = sportIds.isEmpty()
                ? Map.of()
                : sportService.getActiveSportsByIds(sportIds);

        return profiles.stream()
                .filter(profile -> sportsById.containsKey(profile.getSportId()))
                .map(profile -> toUserSportProfileResponse(profile,
                        sportsById.get(profile.getSportId()).getName()))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public UserSportProfileResponse getUserProfileForSport(UUID userId, Long sportId) {
        // A7: active-scoped, same reason as getProfileById.
        UserSportProfile profile = profileRepository.findByUserIdAndSportIdAndIsActiveTrue(userId, sportId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "userId and sportId", userId + ", " + sportId));
        
        // A7: a GATE as well as the name source, exactly as in getProfileById above.
        SportResponse sport = sportService.requireActiveSportById(sportId);
        
        return toUserSportProfileResponse(profile, sport.getName());
    }

    @Override
    @Transactional
    public UserSportProfileResponse updateProfile(Long profileId, UUID callerId, CreateUserSportProfileRequest request) {
        // A7 gate 1 of 2 - the PROFILE must not be soft-deleted. Re-adding a deleted profile goes
        // through createProfile's reactivation path instead, which repopulates it from the request.
        UserSportProfile profile = profileRepository.findByIdAndIsActiveTrue(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "id", profileId));

        if (!profile.getUserId().equals(callerId)) {
            throw new ForbiddenException("You can only update your own sport profile");
        }

        // A7 gate 2 of 2 - the profile's SPORT must still be active. findByIdAndIsActiveTrue above
        // says nothing about the sport; these are independent conditions. Resolved HERE, before any
        // field is touched, rather than at the tail where the response name used to be built: doing
        // it last meant every mutation ran and save() was called before the throw, with only
        // @Transactional rollback preventing a persist. Correct by accident is not correct - splitting
        // the transaction or reordering would have turned it into a real write-then-fail. The response
        // name comes from this same call, so the gate cannot later be dropped as an unused lookup.
        SportResponse sport = sportService.requireActiveSportById(profile.getSportId());

        if (request.getSkillLevel() != null) {
            profile.setSkillLevel(request.getSkillLevel());
        }
        if (request.getYearsOfExperience() != null) {
            profile.setYearsOfExperience(request.getYearsOfExperience());
        }
        if (request.getPreferredPosition() != null) {
            profile.setPreferredPosition(request.getPreferredPosition());
        }
        if (request.getBio() != null) {
            profile.setBio(request.getBio());
        }
        // A10: re-filter what is already stored against the live schema on EVERY update - even one
        // that carries no attributes - so the profile self-heals of definitions the admin has since
        // deleted (Part 2 / "2b"), then overlay the incoming request (A9's lenient filter) and
        // honour an explicit null as a delete marker (Part 1). An absent key still means "leave it
        // alone". The schema lookup is a SportLookupCache hit; the sport is already known active
        // from requireActiveSportById above, though the document itself may still be null.
        SportAttributeSchema schema = sportService.getAttributeSchema(profile.getSportId());
        Map<String, Object> mergedAttributes =
                mergeAttributes(profile.getAttributes(), request.getAttributes(), schema);
        validateAttributesSize(mergedAttributes);
        profile.setAttributes(mergedAttributes);

        UserSportProfile updatedProfile = profileRepository.save(profile);

        log.info("Updated sport profile {} for user {}", profileId, profile.getUserId());
        return toUserSportProfileResponse(updatedProfile, sport.getName());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Two independent conditions, checked cheapest-first: the profile lookup is indexed on
     * {@code (userId, sportId)} and short-circuits before the sport is fetched at all.
     *
     * <p>Uses {@code existsByUserIdAndSportIdAndIsActiveTrue}, <em>not</em> the unfiltered
     * {@code existsByUserIdAndSportId} — the latter matches soft-deleted rows, which is what let a
     * deleted profile keep granting access before A7.
     *
     * <p>Sport status is a {@code containsKey} against {@link SportLookupCache}'s active-only map
     * rather than a query: this is the one sport lookup in this class that needs a boolean instead
     * of a throw, so it reads the cache directly instead of going through
     * {@code SportService.requireActiveSportById} and catching. Net cost is one indexed profile query and an
     * in-memory map hit, and {@code &&} short-circuits, so a user without an active profile never
     * touches sport data at all.
     *
     * <p>A missing sport yields {@code false} rather than a {@code ResourceNotFoundException}:
     * callers use this as a predicate to decide their own error, and a dangling {@code sportId} is
     * indistinguishable from a switched-off one from an access-control standpoint — the same
     * collapse {@code SportService.requireActiveSportById} makes on the write paths.
     */
    @Override
    @Transactional(readOnly = true)
    public boolean hasActiveProfileForActiveSport(UUID userId, Long sportId) {
        return profileRepository.existsByUserIdAndSportIdAndIsActiveTrue(userId, sportId)
                && sportLookupCache.getActiveSportsById().containsKey(sportId);
    }

    @Override
    @Transactional
    public void deleteProfile(Long profileId, UUID callerId) {
        UserSportProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("UserSportProfile", "id", profileId));

        if (!profile.getUserId().equals(callerId)) {
            throw new ForbiddenException("You can only delete your own sport profile");
        }

        profile.setIsActive(false);
        profileRepository.save(profile);
        log.info("Soft deleted sport profile: {}", profileId);
    }

    /**
     * Combines a profile's stored attributes with an incoming request map against the sport's live
     * schema (A10). Three steps:
     *
     * <ol>
     *   <li>the stored map is re-filtered by {@link ProfileAttributeFilter#retainDefined} — keys the
     *       schema no longer defines are pruned, {@code isAvailable: false} values are kept verbatim,
     *       live values are re-validated ("2b");</li>
     *   <li>the request map is filtered by {@link ProfileAttributeFilter#filter} (A9's lenient
     *       drop-what-does-not-fit) and merged on top by top-level key;</li>
     *   <li>any key the raw request carries with an explicit {@code null} is removed from the result
     *       — the delete marker (Part 1). {@code filter} has already dropped those entries, so this
     *       reads the raw request to see them.</li>
     * </ol>
     *
     * <p>An absent key still means "leave it alone"; only an explicit {@code null} deletes. When
     * {@code requested} is {@code null} (the update touches no attributes) only step 1 runs, so the
     * prune still happens on every save. The caller enforces the size cap on the returned map.
     *
     * @param stored    the profile's current attributes; may be {@code null}
     * @param requested the request's attributes map, or {@code null} for "no attribute changes"
     * @param schema    the sport's live schema, or {@code null} when it offers none
     * @return a new, mutable map to store
     */
    private Map<String, Object> mergeAttributes(Map<String, Object> stored,
                                                Map<String, Object> requested,
                                                SportAttributeSchema schema) {
        Map<String, Object> result = new HashMap<>(attributeFilter.retainDefined(stored, schema));
        if (requested != null) {
            result.putAll(attributeFilter.filter(requested, schema));
            for (Map.Entry<String, Object> entry : requested.entrySet()) {
                if (entry.getValue() == null) {
                    result.remove(entry.getKey());
                }
            }
        }
        return result;
    }

    private void validateAttributesSize(Map<String, Object> attributes) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(attributes);
            if (json.length > MAX_ATTRIBUTES_BYTES) {
                throw new BadRequestException("Sport profile attributes exceed the maximum allowed size (4KB)");
            }
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Invalid sport profile attributes");
        }
    }

    private UserSportProfileResponse toUserSportProfileResponse(UserSportProfile profile, String sportName) {
        return UserSportProfileResponse.builder()
                .id(profile.getId())
                .userId(profile.getUserId())
                .sportId(profile.getSportId())
                .sportName(sportName)
                .skillLevel(profile.getSkillLevel())
                .yearsOfExperience(profile.getYearsOfExperience())
                .preferredPosition(profile.getPreferredPosition())
                .bio(profile.getBio())
                .attributes(profile.getAttributes())
                .isActive(profile.getIsActive())
                .createdAt(profile.getCreatedAt())
                .updatedAt(profile.getUpdatedAt())
                .build();
    }
}
