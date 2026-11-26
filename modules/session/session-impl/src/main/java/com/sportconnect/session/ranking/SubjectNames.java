package com.sportconnect.session.ranking;

import java.util.Map;
import java.util.UUID;

/**
 * SESSION-54: how the subjects of a board are named in its tree. A region or country board names a player by user id and a pair
 * by the two user ids sorted and joined by a comma. A group board names a member by the group's permanent member number
 * (SESSION-81) and a pair by the two numbers, sorted as numbers: the same names the group's statistics rows use, so a group
 * board does not carry 36-character ids.
 */
public interface SubjectNames {

    /** The subject of a player's own entry. */
    String single(UUID user);

    /** The subject of the pair of a player and one partner key of their row, or {@code null} when it cannot be named. */
    String pair(UUID user, String partnerKey);

    /** Region and country boards: user ids. */
    static SubjectNames userIds() {
        return new SubjectNames() {
            @Override
            public String single(UUID user) {
                return user.toString();
            }

            @Override
            public String pair(UUID user, String partnerKey) {
                String own = user.toString();
                return own.compareTo(partnerKey) <= 0 ? own + "," + partnerKey : partnerKey + "," + own;
            }
        };
    }

    /** Group boards: the group's member numbers ({@code numbers} by user id). */
    static SubjectNames memberNumbers(Map<UUID, Integer> numbers) {
        return new SubjectNames() {
            @Override
            public String single(UUID user) {
                Integer number = numbers.get(user);
                return number == null ? null : String.valueOf(number);
            }

            @Override
            public String pair(UUID user, String partnerKey) {
                Integer own = numbers.get(user);
                if (own == null) {
                    return null;
                }
                try {
                    int partner = Integer.parseInt(partnerKey);
                    return own <= partner ? own + "," + partner : partner + "," + own;
                } catch (NumberFormatException e) {
                    return null;
                }
            }
        };
    }
}
