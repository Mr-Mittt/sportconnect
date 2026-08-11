package com.sportconnect.common.access;

import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.NotFoundException;
import java.util.UUID;

/**
 * Shared shape for the two independent questions every domain with per-item access rules on a
 * resource (a {@code Post}, a {@code Session}, a {@code SessionComment}) must answer before a
 * caller reads or acts on it: is it available (existence/lifecycle), and — only if so — is it
 * visible to this specific caller (authorization). See
 * {@code documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md} for the full design record, including
 * why this interface deliberately carries no domain logic: each implementing domain writes its
 * own {@code isAvailable}/{@code isVisibleTo} against its own entity, using its own cross-domain
 * {@code -api} calls, exactly like every other cross-domain interaction in this codebase.
 *
 * @param <T> the resource type this gate evaluates
 */
public interface ResourceGate<T> {

    /**
     * Existence/lifecycle only — not soft-deleted, and its parent chain (if any) is also still
     * available. Never evaluates visibility/authorization; see {@link #isVisibleTo}.
     */
    boolean isAvailable(T resource);

    /**
     * Assuming {@link #isAvailable} is already true, can this specific caller read/act on the
     * resource? Callers must not invoke this before confirming availability — {@link #require}
     * enforces that ordering.
     */
    boolean isVisibleTo(T resource, UUID viewerId);

    /**
     * Evaluates availability before visibility, in that fixed order: a resource that doesn't
     * exist has no visibility rule left to evaluate. Throws {@link NotFoundException} if
     * {@code resource} is {@code null} or {@link #isAvailable} returns {@code false}, throws
     * {@link ForbiddenException} if available but {@link #isVisibleTo} returns {@code false},
     * otherwise returns {@code resource} unchanged.
     */
    default T require(T resource, UUID viewerId, String notFoundMessage, String notVisibleMessage) {
        if (resource == null || !isAvailable(resource)) {
            throw new NotFoundException(notFoundMessage);
        }
        if (!isVisibleTo(resource, viewerId)) {
            throw new ForbiddenException(notVisibleMessage);
        }
        return resource;
    }
}
