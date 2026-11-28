package com.sportconnect.session.season;

import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * SESSION-55: makes the settings row {@link SeasonGroupLock} locks, in a transaction of its own. A separate bean from the lock so the
 * call goes through the Spring proxy (a call from inside the same class would not start the new transaction).
 */
@Component
@RequiredArgsConstructor
class SeasonLockRows {

    private final GroupSessionSettingsRepository settingsRepository;

    /** Creates the group's settings row when it has none; a duplicate-key error from a concurrent creator rolls back only this inner transaction. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureRow(Long groupId) {
        if (settingsRepository.existsById(groupId)) {
            return;
        }
        settingsRepository.saveAndFlush(GroupSessionSettings.builder().groupId(groupId).build());
    }
}
