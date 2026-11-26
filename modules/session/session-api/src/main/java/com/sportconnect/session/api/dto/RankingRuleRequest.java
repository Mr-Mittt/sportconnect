package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * SESSION-54 — sets the server-only ranking rule of a board kind (ADMIN). {@code scopeType} is {@code SPORT} (the sport's default;
 * {@code scopeId} omitted) or {@code COUNTRY} ({@code scopeId} the country: its rule covers every region board and the country
 * board). {@code kind} is {@code SINGLE} (a player) or {@code PARTNER} (a pair; the sport must be grouped by partner).
 * {@code sort} is the ordered list of keys, each with its own direction:
 * {@code [{"key":"wins","dir":"DESC"},{"sum":{"wins":3,"games":1},"dir":"DESC"}]}, at most four, every stat collected by the
 * sport. {@code require} is the list of preconditions a player or pair must all meet to be listed, {"key":"games","op":">=","value":5} (keys are stats the sport collects, ops >=, >, <=, <, =; at most six; default none).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RankingRuleRequest {

    private String scopeType;
    private Long scopeId;
    private String kind;
    private List<Object> sort;
    private List<Object> require;
}
