package com.sportconnect.reference.service

import spock.lang.Shared
import spock.lang.Specification
import spock.lang.Subject

/**
 * Runs against the <strong>real bundled polygons</strong> ({@code geo/*.tsv}), not a mock — the whole point of
 * REF-2 is that a coordinate lands in the right place, and the data is deterministic and offline. Building the
 * index is the expensive part, so one lazily-built resolver is shared across every feature method (the first
 * lookup below is therefore also the test of the lazy no-arg path).
 *
 * The seed-vs-polygon invariant (every seeded region has a polygon and the reverse) lives in
 * {@code ReferenceApiIntegrationTest}, where the real seed migration is loaded; here the polygon side is checked
 * against the 63 ISO 3166-2:VN codes the seed uses.
 */
class GeoBoundaryResolverSpec extends Specification {

    @Shared
    @Subject
    GeoBoundaryResolver resolver = new GeoBoundaryResolver()

    // ---------- coordinates ----------

    def "a Vietnamese city resolves to its region and to Vietnam"() {
        expect:
        resolver.locate(latitude, longitude) == Optional.of(new GeoBoundaryResolver.Hit("VN", region))

        where:
        latitude | longitude | region  | city
        10.7769  | 106.7009  | "VN-SG" | "Ho Chi Minh City"
        21.0285  | 105.8542  | "VN-HN" | "Hanoi"
        16.0544  | 108.2022  | "VN-DN" | "Da Nang"
        10.2372  | 105.5232  | "VN-CT" | "Thot Not district, Can Tho"
    }

    def "Natural Earth places central Can Tho (Ninh Kieu) in VN-73 Hau Giang — a source-data inaccuracy, not a resolver bug"() {
        // Verified against the UNsimplified 1:10m admin-1 file: its Can Tho polygon (VN-CT) covers only the
        // northern part of the city's real area. The bundled data reproduces the source; REF-3 replaces the whole
        // Vietnam set (63 -> 34 provinces). This pins the behaviour so a data refresh notices the change.
        expect:
        resolver.locate(10.0341d, 105.7876d).map { it.regionIsoCode() } == Optional.of("VN-73")
    }

    def "provinces whose Natural Earth names are wrong still resolve by their ISO code"() {
        // Natural Earth labels VN-39 / VN-53 / VN-66 with the names of macro regions (Dong Nam Bo, Dong Bac, Dong
        // Bang Song Hong). The resolver matches on iso_3166_2 only, so what matters is that the polygon sits where
        // ISO 3166-2:VN says: VN-39 Dong Nai, VN-53 Bac Kan, VN-66 Hung Yen.
        expect:
        resolver.locate(latitude, longitude).map { it.regionIsoCode() } == Optional.of(region)

        where:
        latitude | longitude | region  | province
        10.9574  | 106.8426  | "VN-39" | "Bien Hoa, Dong Nai"
        22.1470  | 105.8348  | "VN-53" | "Bac Kan"
        20.6464  | 106.0511  | "VN-66" | "Hung Yen"
    }

    def "a point in a country with no bundled regions resolves to the country only"() {
        expect:
        resolver.locate(latitude, longitude) == Optional.of(new GeoBoundaryResolver.Hit(country, null))

        where:
        latitude | longitude | country | place
        48.8566  | 2.3522    | "FR"    | "Paris (Natural Earth reports France with ISO_A2 -99; ISO_A2_EH must be used)"
        59.9139  | 10.7522   | "NO"    | "Oslo (same -99 quirk)"
        13.7563  | 100.5018  | "TH"    | "Bangkok"
        11.5564  | 104.9282  | "KH"    | "Phnom Penh"
        41.8781  | -87.6298  | "US"    | "Chicago"
        -16.8500 | -179.9800 | "FJ"    | "Taveuni, Fiji — east of the antimeridian"
    }

    def "a coastal point can fall outside the simplified polygon and resolve to nothing"() {
        // Documented accuracy caveat (REFERENCE_DATA_DESIGN.md section 7): the polygons are simplified for size, so
        // a point on a coastline (Manhattan, Suva) may land just offshore. The result only pre-fills a form, and
        // the caller falls through to the timezone / locale signal.
        expect:
        resolver.locate(40.7128d, -74.0060d) == Optional.empty()
    }

    def "open ocean resolves to nothing"() {
        expect:
        resolver.locate(0.0d, -140.0d) == Optional.empty()
    }

    def "an invalid coordinate is empty, never an exception"() {
        expect:
        resolver.locate(latitude, longitude) == Optional.empty()

        where:
        latitude       | longitude
        200.0d         | 0.0d
        -90.5d         | 0.0d
        0.0d           | 181.0d
        0.0d           | -180.5d
        Double.NaN     | 106.7d
        10.7d          | Double.NaN
        Double.POSITIVE_INFINITY | 0.0d
    }

    def "the extreme valid coordinates do not throw"() {
        when:
        resolver.locate(90.0d, 180.0d)
        resolver.locate(-90.0d, -180.0d)

        then:
        noExceptionThrown()
    }

    // ---------- timezone ----------

    def "a single-country zone resolves to its country, including the legacy alias browsers report"() {
        expect:
        resolver.countryForTimeZone(zone) == Optional.of(country)

        where:
        zone                  | country
        "Asia/Ho_Chi_Minh"    | "VN"
        "Asia/Saigon"         | "VN"   // backward link, not in zone1970.tab itself
        "Asia/Seoul"          | "KR"
        "America/New_York"    | "US"
        "Australia/Sydney"    | "AU"
    }

    def "a zone shared by several countries, a non-country zone, or junk is not used to guess a country"() {
        expect:
        resolver.countryForTimeZone(zone) == Optional.empty()

        where:
        zone             | why
        "Asia/Bangkok"   | "TH,CX,KH,LA,VN share it"
        "Asia/Tokyo"     | "zone1970.tab lists JP,AU (an Australian bird observatory keeps Tokyo time) — a real merged-zone limitation"
        "Europe/Paris"   | "FR,MC share it"
        "UTC"            | "no country"
        "Etc/GMT-7"      | "nautical zone"
        "Not/AZone"      | "unknown"
        ""               | "blank"
        "   "            | "blank"
        null             | "null"
    }

    def "surrounding whitespace on a zone id is tolerated"() {
        expect:
        resolver.countryForTimeZone("  Asia/Ho_Chi_Minh ") == Optional.of("VN")
    }

    // ---------- data integrity ----------

    def "every Vietnam region code is one of the 63 ISO 3166-2:VN codes the seed uses, and each has a polygon"() {
        given: "the codes seeded by V073 (REF-3 will replace this set with the 34-province list)"
        def seeded = ([1, 2, 3, 4, 5, 6, 7, 9, 13, 14, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
                       35, 36, 37, 39, 40, 41, 43, 44, 45, 46, 47, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 63,
                       66, 67, 68, 69, 70, 71, 72, 73].collect { String.format("VN-%02d", it) }
                + ["VN-CT", "VN-DN", "VN-HN", "VN-HP", "VN-SG"]) as Set

        expect:
        seeded.size() == 63
        resolver.regionCodes() == seeded
    }

    def "every country polygon has a two-letter code and Vietnam is among them"() {
        expect:
        resolver.countryCodes().every { it ==~ /[A-Z]{2}/ }
        resolver.countryCodes().containsAll(["VN", "FR", "NO", "US", "TH"])
        resolver.countryCodes().size() > 200
    }
}
