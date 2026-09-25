package com.sportconnect.reference.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.reference.api.dto.GeoSource
import com.sportconnect.reference.api.dto.ResolveGeoRequest
import com.sportconnect.reference.entity.Country
import com.sportconnect.reference.entity.Language
import com.sportconnect.reference.entity.Region
import com.sportconnect.reference.repository.CountryRepository
import com.sportconnect.reference.repository.LanguageRepository
import com.sportconnect.reference.repository.RegionRepository
import org.spockframework.mock.EmptyOrDummyResponse
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

class ReferenceServiceImplSpec extends Specification {

    LanguageRepository languageRepository = Mock()
    CountryRepository countryRepository = Mock()
    RegionRepository regionRepository = Mock()
    // Empty-or-dummy default: an unstubbed Optional-returning method answers Optional.empty(), as the real resolver does.
    GeoBoundaryResolver geoBoundaryResolver = Mock(defaultResponse: EmptyOrDummyResponse.INSTANCE)

    @Subject
    ReferenceServiceImpl service = new ReferenceServiceImpl(languageRepository, countryRepository, regionRepository, geoBoundaryResolver)

    // ---------- lists ----------

    def "getActiveLanguages maps the active rows the repository returns, in its order"() {
        given:
        languageRepository.findByIsActiveTrueOrderBySortOrderAscCodeAsc() >> [
                Language.builder().id(1L).code("en").name("English").nativeName("English").sortOrder(1).build(),
                Language.builder().id(2L).code("vi").name("Vietnamese").nativeName("Tiếng Việt").sortOrder(2).build()
        ]

        when:
        def result = service.getActiveLanguages()

        then:
        result*.code == ["en", "vi"]
        result[1].name == "Vietnamese"
        result[1].nativeName == "Tiếng Việt"
    }

    def "getActiveCountries maps the active rows"() {
        given:
        countryRepository.findByIsActiveTrueOrderByNameAsc() >> [
                Country.builder().id(7L).iso2("VN").iso3("VNM").name("Vietnam").defaultLanguageCode("vi").build(),
                Country.builder().id(8L).iso2("XX").iso3("XXX").name("Nolang").build()
        ]

        when:
        def result = service.getActiveCountries()

        then:
        result.size() == 2
        result[0].id == 7L
        result[0].iso2 == "VN"
        result[0].iso3 == "VNM"
        result[0].name == "Vietnam"
        result[0].defaultLanguageCode == "vi"
        result[1].defaultLanguageCode == null
    }

    def "getActiveRegions returns the country's active regions"() {
        given:
        countryRepository.existsByIdAndIsActiveTrue(7L) >> true
        regionRepository.findByCountryIdAndIsActiveTrueOrderByNameAsc(7L) >> [
                Region.builder().id(70L).countryId(7L).isoCode("VN-SG").name("Ho Chi Minh").nativeName("Hồ Chí Minh").build()
        ]

        when:
        def result = service.getActiveRegions(7L)

        then:
        result.size() == 1
        result[0].id == 70L
        result[0].countryId == 7L
        result[0].isoCode == "VN-SG"
        result[0].nativeName == "Hồ Chí Minh"
    }

    def "getActiveRegions for an active country with no regions is an empty list, not an error"() {
        given:
        countryRepository.existsByIdAndIsActiveTrue(8L) >> true
        regionRepository.findByCountryIdAndIsActiveTrueOrderByNameAsc(8L) >> []

        expect:
        service.getActiveRegions(8L) == []
    }

    @Unroll
    def "getActiveRegions throws ResourceNotFoundException for an unknown or inactive country (#countryId)"() {
        given:
        countryRepository.existsByIdAndIsActiveTrue(_) >> false

        when:
        service.getActiveRegions(countryId)

        then:
        thrown(ResourceNotFoundException)
        0 * regionRepository._

        where:
        countryId << [999L, null]
    }

    // ---------- batch lookups ----------

    def "getCountriesByIds returns a map keyed by id, omits unknown ids, and does one query"() {
        when:
        def result = service.getCountriesByIds([7L, 999L])

        then:
        1 * countryRepository.findAllById([7L, 999L]) >> [
                Country.builder().id(7L).iso2("VN").iso3("VNM").name("Vietnam").build()
        ]
        result.keySet() == [7L] as Set
        result[7L].iso2 == "VN"
    }

    def "getCountriesByIds includes a deactivated country so an existing reference still resolves"() {
        given:
        countryRepository.findAllById([9L]) >> [
                Country.builder().id(9L).iso2("ZZ").iso3("ZZZ").name("Retired").isActive(false).build()
        ]

        expect:
        service.getCountriesByIds([9L])[9L].name == "Retired"
    }

    def "getRegionsByIds returns a map keyed by id and includes a deactivated region"() {
        given:
        regionRepository.findAllById([70L, 71L]) >> [
                Region.builder().id(70L).countryId(7L).isoCode("VN-SG").name("Ho Chi Minh").nativeName("Hồ Chí Minh").build(),
                Region.builder().id(71L).countryId(7L).isoCode("VN-OLD").name("Old").nativeName("Cũ").isActive(false).build()
        ]

        when:
        def result = service.getRegionsByIds([70L, 71L])

        then:
        result.keySet() == [70L, 71L] as Set
        result[71L].isoCode == "VN-OLD"
    }

    @Unroll
    def "batch lookups with #label ids return an empty map without touching the repository"() {
        when:
        def countries = service.getCountriesByIds(ids)
        def regions = service.getRegionsByIds(ids)

    then:
        countries == [:]
        regions == [:]
        0 * countryRepository._
        0 * regionRepository._

        where:
        label   | ids
        "null"  | null
        "empty" | []
    }

    // ---------- isActiveLanguage ----------

    def "isActiveLanguage asks the repository for a non-blank code"() {
        given:
        languageRepository.existsByCodeAndIsActiveTrue("vi") >> true
        languageRepository.existsByCodeAndIsActiveTrue("fr") >> false

        expect:
        service.isActiveLanguage("vi")
        !service.isActiveLanguage("fr")
    }

    @Unroll
    def "isActiveLanguage is false for #label without a lookup"() {
        when:
        def result = service.isActiveLanguage(code)

    then:
        !result
        0 * languageRepository._

        where:
        label   | code
        "null"  | null
        "empty" | ""
        "blank" | "  "
    }

    // ---------- requireValidSelection ----------

    def "requireValidSelection accepts both null without any lookup"() {
        when:
        service.requireValidSelection(null, null)

        then:
        noExceptionThrown()
        0 * countryRepository._
        0 * regionRepository._
    }

    def "requireValidSelection accepts an active country alone"() {
        given:
        countryRepository.existsByIdAndIsActiveTrue(7L) >> true

        when:
        service.requireValidSelection(7L, null)

        then:
        noExceptionThrown()
        0 * regionRepository._
    }

    def "requireValidSelection accepts an active region that belongs to the country"() {
        given:
        countryRepository.existsByIdAndIsActiveTrue(7L) >> true
        regionRepository.existsByIdAndCountryIdAndIsActiveTrue(70L, 7L) >> true

        when:
        service.requireValidSelection(7L, 70L)

        then:
        noExceptionThrown()
    }

    def "requireValidSelection rejects a region without a country before any lookup"() {
        when:
        service.requireValidSelection(null, 70L)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("without a country")
        0 * countryRepository._
        0 * regionRepository._
    }

    def "requireValidSelection rejects an unknown or inactive country"() {
        given:
        countryRepository.existsByIdAndIsActiveTrue(999L) >> false

        when:
        service.requireValidSelection(999L, null)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("999")
    }

    def "requireValidSelection rejects a region that is not in the country, inactive, or unknown"() {
        given:
        countryRepository.existsByIdAndIsActiveTrue(7L) >> true
        regionRepository.existsByIdAndCountryIdAndIsActiveTrue(80L, 7L) >> false

        when:
        service.requireValidSelection(7L, 80L)

        then:
        def e = thrown(BadRequestException)
        e.message.contains("80")
    }

    // ---------- resolve / resolveByCoordinates (REF-2) ----------
    //
    // The boundary resolver is mocked here on purpose: these specs pin the *priority and fall-through rules*
    // deterministically. That a coordinate actually lands in the right polygon is GeoBoundaryResolverSpec's job
    // (real data), and the real-wiring proof is ReferenceApiIntegrationTest.

    private static final Country VIETNAM = Country.builder().id(7L).iso2("VN").iso3("VNM").name("Vietnam").defaultLanguageCode("vi").build()
    private static final Country THAILAND = Country.builder().id(9L).iso2("TH").iso3("THA").name("Thailand").build()
    private static final Language ENGLISH = Language.builder().id(1L).code("en").name("English").nativeName("English").build()
    private static final Language VIETNAMESE = Language.builder().id(2L).code("vi").name("Vietnamese").nativeName("Tiếng Việt").build()
    private static final Region HCMC = Region.builder().id(80L).countryId(7L).isoCode("VN-SG").name("Ho Chi Minh City").nativeName("Hồ Chí Minh").build()

    /**
     * Seeds only these countries / languages as active rows; everything else is "not seeded". Interactions declared
     * in a helper method must be wrapped in {@code interaction { }}, or Spock reads {@code >>} as a plain shift.
     */
    private void seed(List<Country> countries, List<Language> languages) {
        interaction {
            // Untyped closure parameter + args[0]: a single *typed* Collection parameter would be handed Spock's
            // whole argument list (itself a Collection) instead of the argument.
            countryRepository.findByIso2InAndIsActiveTrue(_) >> { args -> countries.findAll { (args[0] as Collection).contains(it.iso2) } }
            languageRepository.findByCodeInAndIsActiveTrue(_) >> { args -> languages.findAll { (args[0] as Collection).contains(it.code) } }
            languageRepository.findByCodeAndIsActiveTrue(_) >> { args -> Optional.ofNullable(languages.find { it.code == args[0] }) }
        }
    }

    private static ResolveGeoRequest request(Map args) {
        ResolveGeoRequest.builder()
                .locales(args.locales as List<String>)
                .timeZoneId(args.timeZoneId as String)
                .latitude(args.latitude as Double)
                .longitude(args.longitude as Double)
                .build()
    }

    def "coordinates beat the timezone, which beats the locale region"() {
        given: "all three signals name different seeded countries"
        seed([VIETNAM, THAILAND], [ENGLISH, VIETNAMESE])
        geoBoundaryResolver.locate(10.78d, 106.70d) >> Optional.of(new GeoBoundaryResolver.Hit("VN", "VN-SG"))
        geoBoundaryResolver.countryForTimeZone("Asia/Bangkok") >> Optional.of("TH")
        regionRepository.findByIsoCodeAndIsActiveTrue("VN-SG") >> Optional.of(HCMC)

        when:
        def result = service.resolve(request(latitude: 10.78d, longitude: 106.70d, timeZoneId: "Asia/Bangkok", locales: ["th-TH"]))

        then:
        result.country.iso2 == "VN"
        result.source == GeoSource.COORDINATES
        result.region.isoCode == "VN-SG"
    }

    def "the timezone beats the locale region when there are no coordinates"() {
        given:
        seed([VIETNAM, THAILAND], [ENGLISH, VIETNAMESE])
        geoBoundaryResolver.countryForTimeZone("Asia/Ho_Chi_Minh") >> Optional.of("VN")

        when:
        def result = service.resolve(request(timeZoneId: "Asia/Ho_Chi_Minh", locales: ["th-TH"]))

        then:
        result.country.iso2 == "VN"
        result.source == GeoSource.TIMEZONE
    }

    def "the locale region is the last resort, and the first locale that resolves to a seeded country wins"() {
        given: "en-US names an unseeded country, so vi-VN is the one used"
        seed([VIETNAM], [ENGLISH, VIETNAMESE])

        when:
        def result = service.resolve(request(locales: ["en-US", "vi-VN"]))

        then:
        result.country.iso2 == "VN"
        result.source == GeoSource.LOCALE
        result.language.code == "en"      // the browser list still decides the language: en-US came first
        result.region == null
    }

    def "a signal whose country is not seeded falls through to the next signal"() {
        given: "the coordinates are in France, which has no seeded row"
        seed([VIETNAM], [ENGLISH, VIETNAMESE])
        geoBoundaryResolver.locate(48.85d, 2.35d) >> Optional.of(new GeoBoundaryResolver.Hit("FR", null))
        geoBoundaryResolver.countryForTimeZone("Asia/Saigon") >> Optional.of("VN")

        when:
        def result = service.resolve(request(latitude: 48.85d, longitude: 2.35d, timeZoneId: "Asia/Saigon"))

        then:
        result.country.iso2 == "VN"
        result.source == GeoSource.TIMEZONE
        result.region == null
        0 * regionRepository._
    }

    def "a region is only returned when the coordinates won the country"() {
        given: "the coordinates are in an unseeded country, so the timezone wins"
        seed([VIETNAM], [VIETNAMESE])
        geoBoundaryResolver.locate(_, _) >> Optional.of(new GeoBoundaryResolver.Hit("FR", "FR-75"))
        geoBoundaryResolver.countryForTimeZone("Asia/Ho_Chi_Minh") >> Optional.of("VN")

        when:
        def result = service.resolve(request(latitude: 48.85d, longitude: 2.35d, timeZoneId: "Asia/Ho_Chi_Minh"))

        then:
        result.source == GeoSource.TIMEZONE
        result.region == null
        0 * regionRepository._
    }

    def "a region that is inactive, unknown, or belongs to another country is dropped and the country kept"() {
        given:
        seed([VIETNAM], [VIETNAMESE])
        geoBoundaryResolver.locate(_, _) >> Optional.of(new GeoBoundaryResolver.Hit("VN", "VN-SG"))
        regionRepository.findByIsoCodeAndIsActiveTrue("VN-SG") >> regionResult

        when:
        def result = service.resolve(request(latitude: 10.78d, longitude: 106.70d))

        then:
        result.country.iso2 == "VN"
        result.source == GeoSource.COORDINATES
        result.region == null

        where:
        regionResult                                                                          | why
        Optional.empty()                                                                      | "inactive or unknown"
        Optional.of(Region.builder().id(81L).countryId(99L).isoCode("VN-SG").name("x").build()) | "row belongs to a different country"
    }

    def "language: #locales gives #expected"() {
        given: "no country signal, so only the locales matter"
        seed([VIETNAM], [ENGLISH, VIETNAMESE])

        expect:
        service.resolve(request(locales: locales)).language?.code == expected

        where:
        locales                  || expected
        ["vi-VN"]                || "vi"
        ["vi_VN"]                || "vi"          // underscore form is tolerated
        ["en"]                   || "en"
        ["fr", "vi"]             || "vi"          // first *supported* locale, not first locale
        ["fr-FR"]                || null
        ["zh-Hans-CN", "en-US"]  || "en"
        []                       || null
    }

    def "with no supported locale, the resolved country default language is used — when that language is active"() {
        given:
        seed([VIETNAM], languages)
        geoBoundaryResolver.countryForTimeZone("Asia/Ho_Chi_Minh") >> Optional.of("VN")

        when:
        def result = service.resolve(request(timeZoneId: "Asia/Ho_Chi_Minh", locales: ["fr-FR"]))

        then:
        result.language?.code == expected

        where:
        languages                || expected
        [ENGLISH, VIETNAMESE]    || "vi"
        [ENGLISH]                || null   // Vietnam defaults to vi, but vi is not active
    }

    def "the browser locale list wins over the country default language"() {
        given:
        seed([VIETNAM], [ENGLISH, VIETNAMESE])
        geoBoundaryResolver.countryForTimeZone("Asia/Ho_Chi_Minh") >> Optional.of("VN")

        when:
        def result = service.resolve(request(timeZoneId: "Asia/Ho_Chi_Minh", locales: ["en-GB"]))

        then:
        result.country.iso2 == "VN"
        result.language.code == "en"
    }

    def "a country with no default language leaves language null"() {
        given:
        seed([THAILAND], [ENGLISH, VIETNAMESE])
        geoBoundaryResolver.countryForTimeZone("Asia/Bangkok") >> Optional.of("TH")

        when:
        def result = service.resolve(request(timeZoneId: "Asia/Bangkok"))

        then:
        result.country.iso2 == "TH"
        result.language == null
    }

    def "malformed, blank and numeric-region locales are ignored rather than rejected"() {
        given:
        seed([VIETNAM], [ENGLISH, VIETNAMESE])

        when:
        def result = service.resolve(request(locales: ["", "   ", null, "!!!", "es-419"]))

        then: "es-419 has language es (unsupported) and a numeric region, which is not a country candidate"
        result.country == null
        result.language == null
        result.source == null
        0 * countryRepository._
    }

    def "an empty or null request resolves to all-null without touching the database"() {
        when:
        def result = service.resolve(input)

        then:
        result.language == null
        result.country == null
        result.region == null
        result.source == null
        0 * countryRepository._
        0 * regionRepository._
        0 * languageRepository._

        where:
        input << [ResolveGeoRequest.builder().build(), null]
    }

    def "latitude without longitude is not treated as coordinates"() {
        when:
        service.resolve(request(latitude: 10.78d))

        then:
        0 * geoBoundaryResolver.locate(_, _)
    }

    def "all country candidates are loaded with a single query, however many signals there are"() {
        given:
        geoBoundaryResolver.locate(_, _) >> Optional.of(new GeoBoundaryResolver.Hit("VN", null))
        geoBoundaryResolver.countryForTimeZone(_) >> Optional.of("TH")

        when:
        service.resolve(request(latitude: 10.78d, longitude: 106.70d, timeZoneId: "Asia/Bangkok", locales: ["en-US", "vi-VN", "fr-FR"]))

        then:
        1 * countryRepository.findByIso2InAndIsActiveTrue({ it as Set == ["VN", "TH", "US", "FR"] as Set }) >> [VIETNAM]
        1 * languageRepository.findByCodeInAndIsActiveTrue({ it as Set == ["en", "vi", "fr"] as Set }) >> []
        _ * languageRepository.findByCodeAndIsActiveTrue(_) >> Optional.empty()   // the country-default fallback
        0 * countryRepository._
    }

    def "resolveByCoordinates returns the seeded country and region"() {
        given:
        seed([VIETNAM], [])
        geoBoundaryResolver.locate(10.78d, 106.70d) >> Optional.of(new GeoBoundaryResolver.Hit("VN", "VN-SG"))
        regionRepository.findByIsoCodeAndIsActiveTrue("VN-SG") >> Optional.of(HCMC)

        when:
        def match = service.resolveByCoordinates(10.78d, 106.70d)

        then:
        match.isPresent()
        match.get().country.id == 7L
        match.get().region.id == 80L
    }

    def "resolveByCoordinates returns the country alone when the polygon hit carried no region"() {
        given:
        seed([VIETNAM], [])
        geoBoundaryResolver.locate(_, _) >> Optional.of(new GeoBoundaryResolver.Hit("VN", null))

        when:
        def match = service.resolveByCoordinates(10.0d, 106.0d)

        then:
        match.get().country.iso2 == "VN"
        match.get().region == null
        0 * regionRepository._
    }

    def "resolveByCoordinates is empty for an unseeded country, open ocean, and an invalid coordinate"() {
        given:
        seed([VIETNAM], [])
        geoBoundaryResolver.locate(48.85d, 2.35d) >> Optional.of(new GeoBoundaryResolver.Hit("FR", null))
        geoBoundaryResolver.locate(0.0d, -140.0d) >> Optional.empty()
        geoBoundaryResolver.locate(200.0d, 0.0d) >> Optional.empty()

        expect:
        !service.resolveByCoordinates(48.85d, 2.35d).isPresent()
        !service.resolveByCoordinates(0.0d, -140.0d).isPresent()
        !service.resolveByCoordinates(200.0d, 0.0d).isPresent()
    }
}
