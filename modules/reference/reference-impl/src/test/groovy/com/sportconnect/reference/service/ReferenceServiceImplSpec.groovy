package com.sportconnect.reference.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.reference.entity.Country
import com.sportconnect.reference.entity.Language
import com.sportconnect.reference.entity.Region
import com.sportconnect.reference.repository.CountryRepository
import com.sportconnect.reference.repository.LanguageRepository
import com.sportconnect.reference.repository.RegionRepository
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

class ReferenceServiceImplSpec extends Specification {

    LanguageRepository languageRepository = Mock()
    CountryRepository countryRepository = Mock()
    RegionRepository regionRepository = Mock()

    @Subject
    ReferenceServiceImpl service = new ReferenceServiceImpl(languageRepository, countryRepository, regionRepository)

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
}
