package com.sportconnect.auth.repository;

import com.sportconnect.auth.entity.EmailVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {
    
    Optional<EmailVerification> findByToken(String token);
    
    Optional<EmailVerification> findByUserId(UUID userId);
    
    void deleteByUserId(UUID userId);
}
