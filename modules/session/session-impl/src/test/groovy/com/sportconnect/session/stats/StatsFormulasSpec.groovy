package com.sportconnect.session.stats

import spock.lang.Specification

/** SESSION-53: the derived columns: two operands and one of + - * /, an empty result instead of an error. */
class StatsFormulasSpec extends Specification {

    def values = [wins: 6d, losses: 2d, games: 8d, scoreFor: 150d, scoreAgainst: 120d]

    def "#formula evaluates to #expected"() {
        expect:
        StatsFormulas.evaluate(formula, { values[it] }) == expected

        where:
        formula                   | expected
        'wins/games'              | 0.75d
        'wins-losses'             | 4d
        'wins+losses'             | 8d
        'wins*losses'             | 12d
        ' scoreFor - scoreAgainst ' | 30d
        'wins*2'                  | 12d
        'games/2.5'               | 3.2d
    }

    def "a division by zero is no value, not an error"() {
        expect:
        StatsFormulas.evaluate('wins/zero', { it == 'zero' ? 0d : 1d }) == null
        StatsFormulas.evaluate('wins/0', { 1d }) == null
    }

    def "an operand with no value makes the whole formula empty"() {
        expect:
        StatsFormulas.evaluate('wins/unknown', { values[it] }) == null
        StatsFormulas.evaluate('unknown-losses', { values[it] }) == null
    }

    def "#formula is not a formula"() {
        expect:
        !StatsFormulas.isValid(formula)
        StatsFormulas.evaluate(formula, { 1d }) == null

        where:
        formula << [null, '', 'wins', 'wins/games/2', '2/wins', 'wins % games', 'wins/(games)', '(wins)']
    }
}
