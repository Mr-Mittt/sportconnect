package com.sportconnect.user.entity

import spock.lang.Specification

class RoleSpec extends Specification {

    def "equals should return true for same id"() {
        given:
        def role1 = Role.builder().id(1).name("USER").build()
        def role2 = Role.builder().id(1).name("ADMIN").build()

        expect:
        role1.equals(role2)
    }

    def "equals should return false for different id"() {
        given:
        def role1 = Role.builder().id(1).name("USER").build()
        def role2 = Role.builder().id(2).name("USER").build()

        expect:
        !role1.equals(role2)
    }

    def "equals should return false when id is null"() {
        given:
        def role1 = Role.builder().name("USER").build()
        def role2 = Role.builder().name("ADMIN").build()

        expect:
        !role1.equals(role2)
    }

    def "role constants should be defined"() {
        expect:
        Role.USER == "USER"
        Role.VENDOR == "VENDOR"
        Role.GROUP_OWNER == "GROUP_OWNER"
        Role.ADMIN == "ADMIN"
    }

    def "builder should create role with all fields"() {
        when:
        def role = Role.builder()
                .id(1)
                .name("USER")
                .description("Standard user role")
                .build()

        then:
        role.id == 1
        role.name == "USER"
        role.description == "Standard user role"
    }
}
