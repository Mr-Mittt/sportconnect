package com.sportconnect.user.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body of {@code POST /api/users/me/email-change-code} (U26): the address the caller wants to move to. A code is mailed to
 * it, to prove the caller can read that mailbox.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NewEmailCodeRequest {

    @NotBlank(message = "New email is required")
    @Email(message = "New email must be a valid email address")
    @Size(max = 255, message = "New email must be at most 255 characters")
    private String newEmail;
}
