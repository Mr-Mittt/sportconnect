package com.sportconnect.user;

import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public class leetcode {

    public static class ListNode {
        int val;
        ListNode next;
        ListNode() {}
        ListNode(int val) { this.val = val; }
        ListNode(int val, ListNode next) { this.val = val; this.next = next; }
    }

    public ListNode swapPairs(ListNode head) {
        ListNode dump = new ListNode(0, head);
        ListNode prev = dump, curr = head;

        while (curr != null && curr.next != null) {
            ListNode npn = curr.next.next;
            ListNode second = curr.next;

            second.next = curr;
            curr.next = npn;
            prev.next = second;

            prev = curr;
            curr = npn;
        }

        return dump.next;
    }

    public ListNode revertKLinked(ListNode head, int k) {

        ListNode prev = new ListNode(0, head), curr = head;
        int i = 1;

        while (curr != null) {
            ListNode rest = curr.next;
            if (i < k) {
                curr = rest;
                i++;
            } else {
                prev.next = revertLinked(prev.next, rest);
                i = 1;
            }
        }
        return prev;
    }
    public int myAtoi(String s) {
        int l = s.length();
        int sign = 1, limit = 0;
        boolean start = false;

        long out = 0;

        if (l==0) return 0;

        for (int i = 0; i<l; i++) {
            char si = s.charAt(i);

            if (!start) {
                if (si == ' ') continue;
                if (si == '-') {
                    sign = -1;
                    limit = Integer.MIN_VALUE;
                    start = true;
                    continue;
                } else if (si == '+') {
                    start = true;
                    limit = Integer.MAX_VALUE;
                    continue;
                }
            }

            int sint = si - '0';

            if (0<=sint && sint<=9) {
                start = true;

                boolean reachLimit = reachLimit(sign, out, sint);

                if (reachLimit) return limit;

                out = out*10+sint;
            } else {
                return (int) out*sign;
            }
        }
        return (int) out*sign;
    }

    private boolean reachLimit(int sign, long sum, int x) {
        sum = sum * 10 +x;
        if (sign > 0) {
            return sum > Integer.MAX_VALUE;
        } else {
            return sum*sign < Integer.MIN_VALUE;
        }
    }

    private int limit(int sign) {
        return sign>0 ? Integer.MAX_VALUE : Integer.MIN_VALUE;
    }
    public String longestCommonPrefix(String[] strs) {
        List<String> strList = Arrays.asList(strs);
        strList.sort(Comparator.comparingInt(String::length));

        String prefix = strList.get(0);

        for (int i = 1; i < strList.size(); i++) {
            if ("".equals(prefix)) {
                break;
            }
            while (!strList.get(i).startsWith(prefix)) {
                prefix = prefix.substring(0, prefix.length()-1);
            }
        }
        return prefix;
    }

    public ListNode revertLinked(ListNode head, ListNode rest) {
        ListNode prev = head, tail;
        ListNode curr = head.next;

        while (curr != null ) {
            tail = curr.next;

            curr.next = prev;

            prev = curr;
            curr = tail;
        }
        return prev;
    }

    public int removeDuplicated(int[] nums) {
        int n = nums.length, i = 1, j = 1;
        if (n < 2) {
            return n;
        }

        while (j<n) {
            if (nums[j] != nums[i-1]) {
                nums[i]= nums[j];
                i++;
            }
            j++;
        }
        return i;
    }

    public ListNode revertLinked(ListNode head) {
        ListNode prev = null, tail;
        ListNode curr = head;

        while (curr != null ) {
            tail = curr.next;

            curr.next = prev;

            prev = curr;
            curr = tail;
        }

        return prev;
    }

    public ListNode mergeKLists(ListNode[] lists) {
        int s = lists.length;

        if (s==0) {
            return null;
        }

        ListNode temp;
        int tempi = 0;
        boolean go = true;

        while (go) {
            temp = null;
            go = false;

            for (int i = 0; i < s; i++) {
                if (lists[i] != null) {
                    if (!go && lists[i].next != null) {
                        go = true;
                    }

                    if (temp == null) {
                        temp = lists[i];
                        lists[i] = lists[i].next;
                        tempi = i;
                    } else {
                        if (lists[i].val < temp.val) {
                            lists[tempi] = temp;

                            temp = lists[i];
                            tempi = i;
                            lists[i] = lists[i].next;
                        }
                    }
                }

                if (i == s-1 && temp != null) {
                    return new ListNode(temp.val, mergeKLists(lists));
                }
            }
        }
        return null;
    }
}
