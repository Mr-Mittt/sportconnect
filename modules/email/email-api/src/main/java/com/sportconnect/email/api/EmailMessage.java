package com.sportconnect.email.api;

import jakarta.validation.constraints.NotBlank;
import lombok.Builder;
import lombok.Value;

/**
 * A plain-text email ready to send. The caller owns everything about its content (language, wording, links); the
 * email module only delivers it.
 */
@Value
@Builder
public class EmailMessage {

    @NotBlank
    String to;

    @NotBlank
    String subject;

    @NotBlank
    String body;
}
