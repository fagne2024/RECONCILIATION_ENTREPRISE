package com.reconciliation.service;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * Cookie de session JWT : HttpOnly, SameSite=Lax, Secure si HTTPS.
 * Le jeton n'a plus vocation à transiter dans le JSON ni le localStorage.
 */
@Service
public class AuthCookieService {

    public static final String COOKIE_NAME = "AUTH_TOKEN";

    @Value("${jwt.expiration:14400000}")
    private long expirationMs;

    public void addTokenCookie(HttpServletRequest request, HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie(request, token, expirationMs).toString());
    }

    public void clear(HttpServletRequest request, HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildCookie(request, "", 0).toString());
    }

    public String read(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (COOKIE_NAME.equals(cookie.getName())
                    && cookie.getValue() != null
                    && !cookie.getValue().isBlank()) {
                return cookie.getValue();
            }
        }
        return null;
    }

    private ResponseCookie buildCookie(HttpServletRequest request, String value, long maxAgeMs) {
        return ResponseCookie.from(COOKIE_NAME, value == null ? "" : value)
            .httpOnly(true)
            .secure(request != null && request.isSecure())
            .sameSite("Lax")
            .path("/")
            .maxAge(Duration.ofMillis(Math.max(0, maxAgeMs)))
            .build();
    }
}
