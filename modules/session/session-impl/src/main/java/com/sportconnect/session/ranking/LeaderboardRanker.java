package com.sportconnect.session.ranking;

import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.stats.StatBoardRun;
import com.sportconnect.session.stats.StatBoardRunRepository;
import com.sportconnect.sport.api.service.SportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * SESSION-54: runs the ranking pass. Not transactional itself: it picks the dirty boards, plans them (reads only), claims each
 * one in a small transaction of its own, builds it ({@link LeaderboardBoardBuilder}, reads only) and publishes it in another
 * ({@link LeaderboardWriter}); a failure is recorded on the board and never stops the rest.
 *
 * <p><b>The order is the rule.</b> The work is grouped by sport and country: the region boards of a country, by region id, then
 * the country board (its single board from its own players, its pair board merged from the region boards just published). A
 * region's publication marks its country board dirty, so the country is built in the same pass even when nothing of its own
 * changed. Group boards come after, one each. Boards that need a full rebuild share <b>one scan</b> of the sport's players per
 * country ({@link BoardScanner}).
 *
 * <p><b>What is skipped.</b> A sport with statistics switched off, a group with its switch off (the board keeps what was ranked
 * before). <b>Two at once:</b> a board is claimed by compare-and-set ({@code StatBoardRunRepository.claim}, a claim older than the
 * stale limit is taken over), so a second worker skips it; a publication whose claim was taken over rolls back. A pass takes at most
 * {@code max-boards} boards and stops at its time budget; the next tick carries on.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaderboardRanker {

    /** Which boards a pass takes: all the dirty ones (the nightly run) or only those whose last run failed (the retry tick). */
    public enum Mode {
        NIGHTLY, RETRY
    }

    private final StatBoardRunRepository runs;
    private final LeaderboardBoardBuilder builder;
    private final LeaderboardWriter writer;
    private final BoardScanner scanner;
    private final SportService sportService;
    private final GroupSessionSettingsRepository groupSettings;

    @Value("${app.stats.ranking.max-boards:500}")
    private int maxBoards = 500;

    @Value("${app.stats.ranking.stale-minutes:15}")
    private long staleMinutes = 15;

    @Value("${app.stats.ranking.retry-minutes:30}")
    private long retryMinutes = 30;

    @Value("${app.stats.ranking.budget-minutes:45}")
    private long budgetMinutes = 45;

    /** Replaceable in tests; not a constructor dependency. */
    private Clock clock = Clock.systemUTC();

    void setClock(Clock clock) {
        this.clock = clock;
    }

    /** @return how many boards this pass published */
    public int run(Mode mode) {
        Instant start = clock.instant();
        Instant deadline = start.plus(Duration.ofMinutes(budgetMinutes));
        Instant staleBefore = start.minus(Duration.ofMinutes(staleMinutes));
        Set<Long> enabled = sportService.getStatisticsEnabledSportIds();
        if (enabled.isEmpty()) {
            return 0;
        }
        List<StatBoardRun> runnable = runs.findRunnable(start, staleBefore).stream()
                .filter(board -> enabled.contains(board.getSportId()))
                .filter(board -> mode == Mode.NIGHTLY || StatBoardRun.FAILED.equals(board.getStatus()))
                .toList();

        Map<String, List<StatBoardRun>> byCountry = new LinkedHashMap<>();
        List<StatBoardRun> groups = new ArrayList<>();
        runnable.stream().sorted(Comparator.comparing(StatBoardRun::getSportId).thenComparing(StatBoardRun::getScopeId))
                .forEach(board -> {
                    if ("GROUP".equals(board.getScopeType())) {
                        groups.add(board);
                    } else {
                        byCountry.computeIfAbsent(board.getSportId() + ":" + countryOf(board), k -> new ArrayList<>()).add(board);
                    }
                });

        Set<Long> warned = new HashSet<>();
        int published = 0;
        int taken = 0;
        for (List<StatBoardRun> boards : byCountry.values()) {
            if (taken >= maxBoards || !clock.instant().isBefore(deadline)) {
                break;
            }
            published += runCountry(boards, warned);
            taken += boards.size();
        }
        for (StatBoardRun board : groups) {
            if (taken >= maxBoards || !clock.instant().isBefore(deadline)) {
                break;
            }
            if (groupSettings.existsByGroupIdAndStatisticsEnabledTrue(board.getScopeId())) {
                published += runBoard(board, null, false, warned);
            }
            taken++;
        }
        if (published > 0) {
            log.info("Ranking pass ({}) published {} board(s) in {} ms", mode, published,
                    Duration.between(start, clock.instant()).toMillis());
        }
        return published;
    }

    /** A region's country, a country board's own id, or {@code 0} for a board with no country (each is its own unit of work). */
    private static long countryOf(StatBoardRun board) {
        if ("COUNTRY".equals(board.getScopeType())) {
            return board.getScopeId();
        }
        return board.getCountryId() == null ? -board.getScopeId() : board.getCountryId();
    }

    /** The region boards of one country, then its country board. */
    private int runCountry(List<StatBoardRun> boards, Set<Long> warned) {
        List<StatBoardRun> regions = boards.stream().filter(board -> "REGION".equals(board.getScopeType()))
                .sorted(Comparator.comparing(StatBoardRun::getScopeId)).toList();
        StatBoardRun country = boards.stream().filter(board -> "COUNTRY".equals(board.getScopeType())).findFirst().orElse(null);
        Long sportId = boards.get(0).getSportId();
        Long countryId = country != null ? country.getScopeId() : regions.get(0).getCountryId();

        // Plan every board (reads only) and fill, in one pass over the sport's players, every board that must be rebuilt whole.
        Map<StatBoardRun, LeaderboardBoardBuilder.BoardPlan> plans = new LinkedHashMap<>();
        Map<BoardScanner.Target, BoardSet> toScan = new LinkedHashMap<>();
        Map<StatBoardRun, BoardScanner.Target> targets = new LinkedHashMap<>();
        for (StatBoardRun board : regions) {
            addPlan(board, plans, toScan, targets);
        }
        if (country != null) {
            addPlan(country, plans, toScan, targets);
        }
        try {
            if (!toScan.isEmpty()) {
                scanner.scan(sportId, countryId, toScan);
            }
        } catch (RuntimeException e) {
            log.warn("Ranking scan of sport {} country {} failed; its boards will be tried again", sportId, countryId, e);
            plans.keySet().forEach(board -> failNotClaimed(board, e));
            return 0;
        }

        int published = 0;
        for (StatBoardRun board : regions) {
            published += runBoard(board, plans.get(board), toScan.get(targets.get(board)), true, warned);
        }
        // the regions marked their country dirty when they published: build it now, in the same pass
        StatBoardRun countryNow = countryId == null ? null
                : runs.findById(new StatBoardRun.Key(sportId, "COUNTRY", countryId)).orElse(null);
        if (countryNow != null && Boolean.TRUE.equals(countryNow.getDirty())
                && !StatBoardRun.RUNNING.equals(countryNow.getStatus())) {
            // a plan made before the regions published is still right for the country's own single board (its full-rebuild set
            // came from the shared scan); only the merge reads the region trees, and it reads them when it runs
            LeaderboardBoardBuilder.BoardPlan plan = country != null && plans.containsKey(country) ? plans.get(country)
                    : builder.plan(countryNow);
            published += runBoard(countryNow, plan, toScan.get(new BoardScanner.Target("COUNTRY", countryId)), false, warned);
        }
        return published;
    }

    private void addPlan(StatBoardRun board, Map<StatBoardRun, LeaderboardBoardBuilder.BoardPlan> plans,
                         Map<BoardScanner.Target, BoardSet> toScan, Map<StatBoardRun, BoardScanner.Target> targets) {
        LeaderboardBoardBuilder.BoardPlan plan = builder.plan(board);
        plans.put(board, plan);
        if (plan.full() && (plan.singleRule().isPresent() || plan.pairRule().isPresent())) {
            BoardScanner.Target target = new BoardScanner.Target(plan.isCountry() ? "COUNTRY" : "REGION", board.getScopeId());
            targets.put(board, target);
            toScan.put(target, plan.emptySet());
        }
    }

    private int runBoard(StatBoardRun board, BoardSet prebuilt, boolean markCountryDirty, Set<Long> warned) {
        return runBoard(board, builder.plan(board), prebuilt, markCountryDirty, warned);
    }

    private int runBoard(StatBoardRun board, LeaderboardBoardBuilder.BoardPlan plan, BoardSet prebuilt, boolean markCountryDirty,
                         Set<Long> warned) {
        if (plan.singleRule().isEmpty() && plan.pairRule().isEmpty() && warned.add(board.getSportId())) {
            log.info("Sport {} has no ranking rule for any board kind: nothing is built for it (an admin sets one with PUT /api/admin/sessions/ranking/rules/{sportId})", board.getSportId());
        }
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        Instant staleBefore = now.minus(Duration.ofMinutes(staleMinutes));
        if (!writer.claim(board, now, staleBefore)) {
            log.info("Ranking claim lost: {} {} of sport {}", board.getScopeType(), board.getScopeId(), board.getSportId());
            return 0;
        }
        try {
            if (markCountryDirty && board.getCountryId() != null) {
                try {
                    writer.ensureBoardRun(board.getSportId(), "COUNTRY", board.getCountryId(), board.getCountryId());
                } catch (DataIntegrityViolationException e) {
                    log.info("Country board run row race absorbed: {}", board.getCountryId());
                }
            }
            long began = System.nanoTime();
            LeaderboardBoardBuilder.Computation computation = builder.compute(plan, prebuilt);
            writer.publish(new LeaderboardWriter.Publication(board, now, clock.instant().truncatedTo(ChronoUnit.MILLIS),
                    computation, markCountryDirty));
            log.info("Ranked {} {} of sport {}: {} tree(s) in {} ms", board.getScopeType(), board.getScopeId(), board.getSportId(),
                    computation.results().size(), (System.nanoTime() - began) / 1_000_000);
            return 1;
        } catch (RuntimeException e) {
            log.warn("Ranking {} {} of sport {} failed; it will be tried again", board.getScopeType(), board.getScopeId(),
                    board.getSportId(), e);
            try {
                writer.fail(board, now, e.getClass().getSimpleName() + ": " + e.getMessage(),
                        clock.instant().plus(Duration.ofMinutes(retryMinutes)));
            } catch (RuntimeException recordingFailed) {
                log.error("Could not record the ranking failure of {} {}; the claim goes stale and is taken over",
                        board.getScopeType(), board.getScopeId(), recordingFailed);
            }
            return 0;
        }
    }

    /** A board whose shared scan failed before it was claimed: claim it just to record the failure so the retry tick finds it. */
    private void failNotClaimed(StatBoardRun board, RuntimeException cause) {
        Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
        try {
            if (writer.claim(board, now, now.minus(Duration.ofMinutes(staleMinutes)))) {
                writer.fail(board, now, cause.getClass().getSimpleName() + ": " + cause.getMessage(),
                        now.plus(Duration.ofMinutes(retryMinutes)));
            }
        } catch (RuntimeException e) {
            log.error("Could not record the ranking scan failure of {} {}", board.getScopeType(), board.getScopeId(), e);
        }
    }
}
