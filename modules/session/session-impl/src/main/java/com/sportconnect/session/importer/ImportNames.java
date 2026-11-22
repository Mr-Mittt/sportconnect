package com.sportconnect.session.importer;

import java.text.Normalizer;
import java.util.Locale;

/** SESSION-70 — how a sheet name is compared with a member's first name: no accents, no case, single spaces. */
final class ImportNames {

    private ImportNames() {
    }

    /** {@code "Ánh"}, {@code "anh"} and {@code " ÁNH "} are the same name; {@code "Đức"} is {@code "duc"} (đ has no decomposition). */
    static String normalize(String name) {
        if (name == null) {
            return "";
        }
        String t = Normalizer.normalize(name.trim(), Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        t = t.replace('đ', 'd').replace('Đ', 'D');
        return t.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }
}
