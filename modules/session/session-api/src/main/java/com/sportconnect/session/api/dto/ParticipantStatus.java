package com.sportconnect.session.api.dto;

/**
 * {@code REQUESTED} is set by {@code joinSession} when the caller asked to join a session whose
 * {@code autoApprove} is false — awaiting the creator/owner-admin's decision via the
 * approve/reject endpoints (approve → {@code JOINED}; reject → {@code LEFT}, with an optional
 * {@code SessionParticipant.rejectReason}). {@code INVITED} is pre-created at session creation
 * for each {@code CreateSessionRequest.inviteeIds} entry — it's a different wait than
 * {@code REQUESTED}: no creator decision needed, only the invitee's own {@code joinSession} call,
 * which resolves an {@code INVITED} row straight to {@code JOINED} regardless of
 * {@code autoApprove}. Once a row leaves {@code INVITED} (accepted or otherwise), that history
 * isn't tracked — a later leave-and-rejoin goes through the normal {@code autoApprove}/
 * {@code REQUESTED} path.
 */
public enum ParticipantStatus {
    JOINED,
    LEFT,
    REQUESTED,
    INVITED
}
