package com.sportconnect.integration;

import java.text.Normalizer;

/**
 * SESSION-GL-64 — the H2 stand-in for Postgres's {@code immutable_unaccent()} (migration V090), registered by an
 * {@code CREATE ALIAS} in {@code schema.sql} so the name search runs the same SQL on the in-memory test database.
 * Same effect as Postgres's {@code unaccent} on Vietnamese text: accents are dropped and {@code đ/Đ} become {@code d/D}.
 * It proves our query shape and matching rule, not Postgres's own rules file; {@code UserNameSearchPostgresTest}
 * checks the real function against a real Postgres.
 */
public final class H2Functions {

    private H2Functions() {
    }

    /** Called by H2 as {@code immutable_unaccent(text)}; a null in is a null out, like the {@code STRICT} original. */
    public static String immutableUnaccent(String text) {
        if (text == null) {
            return null;
        }
        return Normalizer.normalize(text, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replace('đ', 'd')
                .replace('Đ', 'D');
    }
}
