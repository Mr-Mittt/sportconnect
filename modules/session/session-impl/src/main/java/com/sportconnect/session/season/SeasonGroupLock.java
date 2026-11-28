package com.sportconnect.session.season;

import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

/**
 * SESSION-55: the per-group mutex for creating and editing seasons. The group's {@code group_session_settings} row is locked
 * ({@code SELECT ... FOR UPDATE}) for the rest of the caller's transaction; the loser of two simultaneous creates waits, then re-reads the
 * group's seasons and gets the coded 409. A default row (off, WEEKLY, statistics off) means exactly what "no row" means to every reader of
 * that table, so making it only for this lock changes nothing for them.
 */
@Slf4j
@Component
@RequiredArgsConstructor
class SeasonGroupLock {

    private final SeasonLockRows rows;
    private final GroupSessionSettingsRepository settingsRepository;

    /** Locks the group's seasons for the caller's transaction; call inside {@code @Transactional}. */
    public void lock(Long groupId) {
        try {
            rows.ensureRow(groupId);
        } catch (DataIntegrityViolationException e) {
            log.debug("Settings row of group {} was made by a concurrent caller", groupId);
        }
        settingsRepository.findForUpdate(groupId);
    }
}
