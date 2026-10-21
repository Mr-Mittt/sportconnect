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
 * Body of {@code PUT /api/users/me/email} (U26). Two proofs are needed: of the caller (exactly one of the current password,
 * or the code emailed to the <em>current</em> address for {@code CHANGE_EMAIL}) and of the new mailbox
 * ({@code newEmailCode}, the code emailed to {@code newEmail} by {@code POST /me/email-change-code}).
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChangeEmailRequest {

    @NotBlank(message = "New email is required")
    @Email(message = "New email must be a valid email address")
    @Size(max = 255, message = "New email must be at most 255 characters")
    private String newEmail;

    @NotBlank(message = "The code sent to the new email is required")
    private String newEmailCode;

    private String currentPassword;

    private String verificationCode;
}
