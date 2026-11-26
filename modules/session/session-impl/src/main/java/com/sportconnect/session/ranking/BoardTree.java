package com.sportconnect.session.ranking;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.function.BiConsumer;

/**
 * SESSION-54 (locked by the owner, 2026-11-26): one ranked board, held as a <b>tree keyed by the sort values</b> and stored
 * as one jsonb document ({@code leaderboard_entry.tree}).
 *
 * <p><b>Shape.</b> {@code {"v":1, "sort":[...], "n":5, "t":[["10",[["11",["A,B~1","C,D~1"]]]],["9",[["10",["A,C~3"]]]]]}}:
 * {@code t} has one level per sort key; a node is a {@code [key, child]} pair (an array, not an object, because jsonb would
 * reorder the keys), the nodes of a level are <b>already in rank order</b>, and the last level's child is the list of subjects
 * that have exactly those values ({@code "A,B"} is a pair, the sorted member ids; a single is one id). A subject is written
 * {@code subject~prevRank}, the rank it had in the previous build, or just {@code subject} when it was not on the board then.
 * The rank itself is not stored: it is <b>derived</b> (1 plus the number of entries in the better nodes), and the entries of a
 * leaf tie. Counters are not stored either: the path carries the sort values.
 *
 * <p><b>In memory</b> the tree is flat: the subjects of each distinct value tuple, and the tuple of each subject, so moving a
 * subject (its numbers changed) is one lookup, one removal and one insert; the nested form is only the stored one.
 */
public final class BoardTree {

    private static final int FORMAT = 1;

    /** One entry of a ranked board, best first. */
    public record Entry(String subject, int rank, SortTuple values, Integer prevRank) {
    }

    private final SortList sort;
    private final Map<SortTuple, TreeSet<String>> leaves = new HashMap<>();
    private final Map<String, SortTuple> bySubject = new HashMap<>();
    private final Map<String, Integer> baked = new HashMap<>();

    public BoardTree(SortList sort) {
        this.sort = sort;
    }

    public SortList sort() {
        return sort;
    }

    /** How many subjects are on the board. */
    public int size() {
        return bySubject.size();
    }

    public boolean contains(String subject) {
        return bySubject.containsKey(subject);
    }

    /** The sort values of a subject, or {@code null} when it is not on the board. */
    public SortTuple tupleOf(String subject) {
        return bySubject.get(subject);
    }

    /** The rank the subject had in the previous build, as stored with this tree; {@code null} when it had none. */
    public Integer prevRankOf(String subject) {
        return baked.get(subject);
    }

    /**
     * Puts a subject on the board with these values, moving it when it is already there with others.
     *
     * @return whether the board changed
     */
    public boolean put(String subject, SortTuple tuple) {
        SortTuple old = bySubject.get(subject);
        if (tuple.equals(old)) {
            return false;
        }
        if (old != null) {
            removeFromLeaf(subject, old);
        }
        bySubject.put(subject, tuple);
        leaves.computeIfAbsent(tuple, t -> new TreeSet<>()).add(subject);
        return true;
    }

    /** @return whether the subject was on the board */
    public boolean remove(String subject) {
        SortTuple old = bySubject.remove(subject);
        if (old == null) {
            return false;
        }
        removeFromLeaf(subject, old);
        return true;
    }

    private void removeFromLeaf(String subject, SortTuple tuple) {
        TreeSet<String> leaf = leaves.get(tuple);
        if (leaf != null) {
            leaf.remove(subject);
            if (leaf.isEmpty()) {
                leaves.remove(tuple);
            }
        }
    }

    /** The previous ranks stored with this tree, as they are (what a refresh that is not a new build copies unchanged). */
    public Map<String, Integer> bakedRanks() {
        return new HashMap<>(baked);
    }

    /** Calls the consumer for every subject with its sort values (no particular order). */
    public void forEachSubject(BiConsumer<String, SortTuple> consumer) {
        bySubject.forEach(consumer);
    }

    /** Orders two value tuples by the sort list: a negative number when {@code a} ranks before {@code b}; no value ranks last. */
    public int compare(SortTuple a, SortTuple b) {
        for (int i = 0; i < sort.size(); i++) {
            double x = a.get(i);
            double y = b.get(i);
            boolean noX = Double.isNaN(x);
            boolean noY = Double.isNaN(y);
            if (noX || noY) {
                if (noX && noY) {
                    continue;
                }
                return noX ? 1 : -1;
            }
            int result = sort.keys().get(i).descending() ? Double.compare(y, x) : Double.compare(x, y);
            if (result != 0) {
                return result;
            }
        }
        return 0;
    }

    private List<SortTuple> orderedTuples() {
        List<SortTuple> tuples = new ArrayList<>(leaves.keySet());
        tuples.sort(this::compare);
        return tuples;
    }

    /** The rank of every subject (competition ranking: the entries of a leaf share the rank of its first place), best first. */
    public Map<String, Integer> ranks() {
        Map<String, Integer> ranks = new LinkedHashMap<>();
        int before = 0;
        for (SortTuple tuple : orderedTuples()) {
            TreeSet<String> leaf = leaves.get(tuple);
            for (String subject : leaf) {
                ranks.put(subject, before + 1);
            }
            before += leaf.size();
        }
        return ranks;
    }

    /** Every entry in rank order, with its baked previous rank (for reading a board). */
    public List<Entry> entries() {
        List<Entry> entries = new ArrayList<>(bySubject.size());
        int before = 0;
        for (SortTuple tuple : orderedTuples()) {
            TreeSet<String> leaf = leaves.get(tuple);
            for (String subject : leaf) {
                entries.add(new Entry(subject, before + 1, tuple, baked.get(subject)));
            }
            before += leaf.size();
        }
        return entries;
    }

    /**
     * The stored form.
     *
     * @param previousRanks the rank of each subject before this build ({@link #ranks()} of the tree as it was loaded); a subject
     *                      with none is written without a previous rank
     * @param cap           the most entries to keep, the best ones (ties beyond it are cut by subject key); 0 or less keeps all
     */
    public Map<String, Object> toJson(Map<String, Integer> previousRanks, int cap) {
        int depth = sort.size();
        List<Object> root = new ArrayList<>();
        String[] currentKeys = new String[depth];
        @SuppressWarnings("unchecked")
        List<Object>[] currentLists = new List[depth];
        int written = 0;
        outer:
        for (SortTuple tuple : orderedTuples()) {
            if (cap > 0 && written >= cap) {
                break;                      // no node is made for a value none of whose entries fits
            }
            boolean changed = false;
            for (int level = 0; level < depth; level++) {
                String key = tuple.key(level);
                if (changed || currentKeys[level] == null || !currentKeys[level].equals(key)) {
                    changed = true;
                    List<Object> parent = level == 0 ? root : currentLists[level - 1];
                    List<Object> child = new ArrayList<>();
                    parent.add(new ArrayList<>(List.of(key, child)));
                    currentKeys[level] = key;
                    currentLists[level] = child;
                }
            }
            for (String subject : leaves.get(tuple)) {
                if (cap > 0 && written >= cap) {
                    break outer;
                }
                Integer previous = previousRanks == null ? null : previousRanks.get(subject);
                currentLists[depth - 1].add(previous == null ? subject : subject + "~" + previous);
                written++;
            }
        }
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("v", FORMAT);
        json.put("sort", sort.toJson());
        json.put("n", written);
        json.put("t", root);
        return json;
    }

    /** Reads a stored tree; a document that cannot be read gives an empty board with an empty sort list. */
    public static BoardTree fromJson(Object node) {
        if (!(node instanceof Map<?, ?> map)) {
            return new BoardTree(SortList.fromStored(null));
        }
        BoardTree tree = new BoardTree(SortList.fromStored(map.get("sort")));
        if (tree.sort.isEmpty() || !(map.get("t") instanceof List<?> levels)) {
            return tree;
        }
        tree.load(levels, 0, new String[tree.sort.size()]);
        return tree;
    }

    private void load(List<?> level, int depth, String[] path) {
        for (Object node : level) {
            if (!(node instanceof List<?> pair) || pair.size() != 2 || !(pair.get(0) instanceof String key)
                    || !(pair.get(1) instanceof List<?> child)) {
                continue;
            }
            path[depth] = key;
            if (depth + 1 < sort.size()) {
                load(child, depth + 1, path);
                continue;
            }
            SortTuple tuple = SortTuple.parse(path.clone());
            for (Object entry : child) {
                if (entry instanceof String text) {
                    int tilde = text.indexOf('~');
                    String subject = tilde < 0 ? text : text.substring(0, tilde);
                    if (tilde >= 0) {
                        try {
                            baked.put(subject, Integer.parseInt(text.substring(tilde + 1)));
                        } catch (NumberFormatException e) {
                            // an unreadable previous rank is just not there
                        }
                    }
                    bySubject.put(subject, tuple);
                    leaves.computeIfAbsent(tuple, t -> new TreeSet<>()).add(subject);
                }
            }
        }
    }
}
