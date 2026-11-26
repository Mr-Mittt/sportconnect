package com.sportconnect.session.ranking;

import com.sportconnect.session.stats.LeaderboardEntry;
import com.sportconnect.session.stats.LeaderboardEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * SESSION-54 slice B: the boards the read endpoints serve, held in memory. A tree is parsed once and kept, with the entries in rank
 * order and an index of each player's best place, so a page and the caller's own rank cost no parsing. A cached board is valid
 * while its {@code computed_at} is the stored one: every read asks the database for that one timestamp (the tree is not read), and
 * a board published since is loaded again. The cache holds at most {@code app.stats.ranking.read-cache-boards} boards, the least
 * recently read leaves first, so its memory is bounded (a country board of hundreds of thousands of entries is the large case).
 * Nothing is shared between instances: each keeps its own, and each is corrected by the same timestamp.
 */
@Component
@RequiredArgsConstructor
public class LeaderboardTreeCache {

    /** One board as the readers use it. {@code best} maps a subject token (one player of a pair, or a single) to its best index in {@code entries}. */
    public record Loaded(Instant computedAt, BoardTree tree, List<BoardTree.Entry> entries, Map<String, Integer> best, int total) {
    }

    private final LeaderboardEntryRepository repository;

    @Value("${app.stats.ranking.read-cache-boards:8}")
    private int capacity = 8;

    private final Map<String, Loaded> cache = new LinkedHashMap<>(16, 0.75f, true);

    /** @return the board, or {@code null} when none was ever published (or it was removed with its rule) */
    public Loaded get(Long sportId, String scopeType, Long scopeId, String kind) {
        Optional<Instant> stored = repository.findComputedAt(sportId, scopeType, scopeId, kind);
        String key = sportId + ":" + scopeType + ":" + scopeId + ":" + kind;
        if (stored.isEmpty()) {
            synchronized (cache) {
                cache.remove(key);
            }
            return null;
        }
        synchronized (cache) {
            Loaded cached = cache.get(key);
            if (cached != null && cached.computedAt().equals(stored.get())) {
                return cached;
            }
        }
        LeaderboardEntry row = repository.findById(new LeaderboardEntry.Key(sportId, scopeType, scopeId, kind)).orElse(null);
        if (row == null) {
            return null;
        }
        Loaded loaded = load(row);
        synchronized (cache) {
            cache.put(key, loaded);
            while (cache.size() > Math.max(1, capacity)) {
                cache.remove(cache.keySet().iterator().next());
            }
        }
        return loaded;
    }

    /** Forgets everything (tests, and a rule change that must not wait for a timestamp). */
    public void clear() {
        synchronized (cache) {
            cache.clear();
        }
    }

    private static Loaded load(LeaderboardEntry row) {
        BoardTree tree = BoardTree.fromJson(row.getTree());
        List<BoardTree.Entry> entries = new ArrayList<>(tree.entries());
        Map<String, Integer> best = new HashMap<>();
        for (int i = 0; i < entries.size(); i++) {
            for (String token : entries.get(i).subject().split(",")) {
                best.putIfAbsent(token, i);          // entries are best first, so the first place a player appears is their best
            }
        }
        return new Loaded(row.getComputedAt(), tree, entries, best, entries.size());
    }
}
