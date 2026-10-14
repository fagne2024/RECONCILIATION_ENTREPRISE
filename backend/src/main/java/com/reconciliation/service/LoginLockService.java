package com.reconciliation.service;

import com.reconciliation.entity.UserEntity;
import com.reconciliation.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class LoginLockService {

    public static final int MAX_FAILED_ATTEMPTS = 5;
    public static final int LOCK_DURATION_MINUTES = 30;

    private final UserRepository userRepository;

    public LoginLockService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public boolean isAccountLocked(UserEntity user) {
        LocalDateTime lockedUntil = user.getAccountLockedUntil();
        if (lockedUntil == null) {
            return false;
        }
        if (lockedUntil.isAfter(LocalDateTime.now())) {
            return true;
        }
        user.setAccountLockedUntil(null);
        user.setFailedLoginAttempts(0);
        userRepository.save(user);
        return false;
    }

    public Optional<ResponseEntity<?>> buildLockedResponse(UserEntity user) {
        if (!isAccountLocked(user)) {
            return Optional.empty();
        }
        return Optional.of(ResponseEntity.status(HttpStatus.LOCKED).body(buildLockedBody(user)));
    }

    public Map<String, Object> recordFailedAttempt(UserEntity user) {
        int attempts = (user.getFailedLoginAttempts() != null ? user.getFailedLoginAttempts() : 0) + 1;
        user.setFailedLoginAttempts(attempts);

        if (attempts >= MAX_FAILED_ATTEMPTS) {
            user.setAccountLockedUntil(LocalDateTime.now().plusMinutes(LOCK_DURATION_MINUTES));
            userRepository.save(user);
            return buildLockedBody(user);
        }

        userRepository.save(user);
        Map<String, Object> body = new HashMap<>();
        body.put("error", buildInvalidCredentialsMessage(attempts));
        body.put("remainingAttempts", MAX_FAILED_ATTEMPTS - attempts);
        return body;
    }

    public void resetFailedAttempts(UserEntity user) {
        if ((user.getFailedLoginAttempts() != null && user.getFailedLoginAttempts() > 0)
                || user.getAccountLockedUntil() != null) {
            user.setFailedLoginAttempts(0);
            user.setAccountLockedUntil(null);
            userRepository.save(user);
        }
    }

    private Map<String, Object> buildLockedBody(UserEntity user) {
        Map<String, Object> body = new HashMap<>();
        body.put("error", buildLockedMessage(user));
        body.put("locked", true);
        LocalDateTime lockedUntil = user.getAccountLockedUntil();
        if (lockedUntil != null) {
            body.put("lockedUntil", lockedUntil.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        }
        return body;
    }

    public String buildLockedMessage(UserEntity user) {
        LocalDateTime lockedUntil = user.getAccountLockedUntil();
        if (lockedUntil == null) {
            return "Votre compte est verrouillé pour des raisons de sécurité. Réessayez dans "
                    + LOCK_DURATION_MINUTES + " minutes.";
        }
        long minutesRemaining = Math.max(1, Duration.between(LocalDateTime.now(), lockedUntil).toMinutes());
        return "Votre compte est verrouillé pour des raisons de sécurité. Réessayez dans "
                + minutesRemaining + " minute" + (minutesRemaining > 1 ? "s" : "") + ".";
    }

    private String buildInvalidCredentialsMessage(int attempts) {
        int remaining = MAX_FAILED_ATTEMPTS - attempts;
        if (remaining <= 0) {
            return "Login ou mot de passe incorrect";
        }
        return "Login ou mot de passe incorrect. Il vous reste " + remaining + " tentative"
                + (remaining > 1 ? "s" : "") + " avant verrouillage du compte.";
    }
}
