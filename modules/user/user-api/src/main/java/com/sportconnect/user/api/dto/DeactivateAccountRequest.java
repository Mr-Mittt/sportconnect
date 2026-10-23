package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Body of {@code POST /api/users/me/deactivate} (U22, U24): exactly one proof, the caller's current password (checked
 * by Keycloak) or the code emailed by {@code POST /api/users/me/confirmation-code}. Neither or both is
 * {@code 400 CONFIRMATION_REQUIRED}, enforced by the service.
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeactivateAccountRequest {

    private String currentPassword;

    private String verificationCode;
}
