package com.sportconnect.session.api.dto;

/**
 * {@code feeAmountVnd} on the owning {@code Session} is meaningful only when {@code feeType} is
 * {@code FIXED} — {@code SessionServiceImpl} clears it to null whenever the resolved feeType is
 * {@code FREE} or {@code SPLIT}, so a stale amount never survives a fee-type change.
 */
public enum FeeType {
    FREE,
    SPLIT,
    FIXED
}
