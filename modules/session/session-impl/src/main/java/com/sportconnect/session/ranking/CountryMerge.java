package com.sportconnect.session.ranking;

import java.util.List;

/**
 * SESSION-54 (owner, 2026-11-26): the country's pair board is built from the region boards of the country, and <b>a pair
 * counts at its best region only</b>: a pair that appears in several region boards keeps the entry that ranks best by the
 * sport's sort list (the first region wins an exact tie, so the order the regions are given in decides). The pair's games are
 * not added up across regions, which is the owner's choice, so a pair that played 5 ranking games in each of two regions
 * shows 5, not 10. A pure function, so the country board is always rebuilt whole from the region boards as they are published.
 */
public final class CountryMerge {

    private CountryMerge() {
    }

    /**
     * @param sort        the sport's sort list for the country (the region boards share it)
     * @param regionTrees the region boards, in region id order
     */
    public static BoardTree mergeRegions(SortList sort, List<BoardTree> regionTrees) {
        BoardTree merged = new BoardTree(sort);
        for (BoardTree region : regionTrees) {
            region.forEachSubject((subject, tuple) -> {
                SortTuple current = merged.tupleOf(subject);
                if (current == null || merged.compare(tuple, current) < 0) {
                    merged.put(subject, tuple);
                }
            });
        }
        return merged;
    }
}
