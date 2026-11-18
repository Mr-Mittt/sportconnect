package com.sportconnect.session.api.dto;

/**
 * SESSION-GROUP-6 — which regular sessions of a group a count (and a cancel) is about. {@code ALL}: every scheduled regular
 * session of the group (what turning generation off or switching the mode would leave behind). {@code RECURRENCE}: only
 * those generated from one configuration (what deleting it would leave behind).
 */
public enum RegularSessionScope {
    ALL,
    RECURRENCE
}
