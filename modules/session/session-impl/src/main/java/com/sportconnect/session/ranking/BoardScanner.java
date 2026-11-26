package com.sportconnect.session.ranking;

import com.sportconnect.session.stats.PlayerStatsDoc;
import com.sportconnect.session.stats.UserSportStats;
import com.sportconnect.session.stats.UserSportStatsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-54: a full rebuild of region and country boards. One pass over a sport's players, keyset-paged by user id (no lock, no
 * transaction, so no entity piles up in a persistence context), fills <b>every board that needs rebuilding at once</b>: a rule
 * change in a country with 60 regions is one scan, not 60. Not an index lookup: a player with a scope at a place cannot be found
 * without reading the blob (a GIN index on {@code scopes} would only narrow the pass, and is not built); it is the rare path
 * (the first build of a board, a changed rule), the nightly run reads only the players who changed.
 */
@Service
@RequiredArgsConstructor
public class BoardScanner {

    /** A board the scan fills: a {@code REGION} (the region id) or the {@code COUNTRY}'s single board (the country id). */
    public record Target(String scopeType, Long scopeId) {
    }

    private final UserSportStatsRepository userStats;

    @Value("${app.stats.ranking.scan-page-size:500}")
    private int pageSize = 500;

    /**
     * @param countryId when not null, a player with no entry at that country is skipped without being read further
     * @return how many players were put through the sets
     */
    public int scan(Long sportId, Long countryId, Map<Target, BoardSet> sets) {
        SubjectNames names = SubjectNames.userIds();
        UUID after = new UUID(0L, 0L);
        int players = 0;
        while (true) {
            List<UserSportStats> page = userStats.findPageAfter(sportId, after, PageRequest.of(0, pageSize));
            if (page.isEmpty()) {
                return players;
            }
            for (UserSportStats row : page) {
                PlayerStatsDoc doc = PlayerStatsDoc.read(row);
                if (countryId != null && doc.scopes().stream().noneMatch(scope -> countryId.equals(scope.countryId()))) {
                    continue;
                }
                sets.forEach((target, set) -> set.apply(names, row.getUserId(), "REGION".equals(target.scopeType())
                        ? PlayerEntries.ofRegion(doc, target.scopeId()) : PlayerEntries.ofCountry(doc, target.scopeId())));
                players++;
            }
            after = page.get(page.size() - 1).getUserId();
        }
    }
}
