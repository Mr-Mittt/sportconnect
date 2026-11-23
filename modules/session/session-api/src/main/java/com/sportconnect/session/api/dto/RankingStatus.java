package com.sportconnect.session.api.dto;

/**
 * SESSION-72: where a record stands as a ranking game. Derived on every read, never stored.
 * {@code NORMAL}: not proposed. {@code PROPOSED}: proposed, not every player has confirmed its current content.
 * {@code VERIFIED}: proposed, the score is complete with the first team ahead, and every player named in the record has
 * confirmed its current content.
 */
public enum RankingStatus {
    NORMAL,
    PROPOSED,
    VERIFIED
}
