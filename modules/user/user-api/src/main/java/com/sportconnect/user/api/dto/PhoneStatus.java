package com.sportconnect.user.api.dto;

/**
 * What is known about {@code users.phone_number}; {@code null} on the user when there is no phone at all.
 *
 * <p>The client mirrors this enum (the Account Settings hint for {@link #INVALID}), so a new value needs its client case.
 */
public enum PhoneStatus {

    /** Kept as the user typed it: it did not parse as a real number. Not an identifier, not unique, never matched. */
    INVALID,

    /** Parses as a real number and is stored as E.164, unique among usable numbers. Not proven to be the user's. */
    VALID,

    /** Proven to be the user's (a provider such as Zalo vouched for it, or a future code check). Nothing sets it yet. */
    VERIFIED
}
