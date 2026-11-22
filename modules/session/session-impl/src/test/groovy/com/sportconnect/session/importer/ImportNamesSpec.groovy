package com.sportconnect.session.importer

import spock.lang.Specification
import spock.lang.Unroll

/** SESSION-70: how a sheet name is compared with a first name. */
class ImportNamesSpec extends Specification {

    @Unroll
    def "'#input' compares as '#expected'"() {
        expect:
        ImportNames.normalize(input) == expected

        where:
        input            | expected
        'Ánh'            | 'anh'
        ' ÁNH '          | 'anh'
        'Đức'            | 'duc'
        'đức'            | 'duc'
        'Hiếu  Nguyễn'   | 'hieu nguyen'
        'Anh_VL'         | 'anh_vl'
        null             | ''
    }
}
