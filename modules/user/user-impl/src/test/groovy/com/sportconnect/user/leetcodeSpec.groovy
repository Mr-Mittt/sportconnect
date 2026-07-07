package com.sportconnect.user

import spock.lang.Ignore
import spock.lang.Specification

@Ignore
class leetcodeSpec extends Specification {
    def leetcode = new leetcode()
    def 'ss'() {
        given:
        def l1 = ln(1 as int, ln(2 as int, ln(3 as int, ln(4 as int))))
        when:
        def r = leetcode.revertKLinked(l1, 2)
        then:
        r == 2
    }

    def 's'() {
        given:
        def strs = ["dog","racecar","car"] as String[]
        when:
        def r = leetcode.myAtoi("21474836460")
        then:
        r == 2
    }

    def ln(int val, leetcode.ListNode next) {
        new leetcode.ListNode(val, next)
    }

    def ln(int val) {
        new leetcode.ListNode(val)
    }
}
