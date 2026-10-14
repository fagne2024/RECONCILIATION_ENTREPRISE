package com.reconciliation.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Service pour la gestion des JWT (JSON Web Tokens)
 * Permet de générer, valider et extraire les informations des tokens JWT
 */
@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration:86400000}") // 24 heures par défaut
    private Long expiration;

    /** Claim portant le role : SUPER_ADMIN | ADMIN | USER. */
    public static final String CLAIM_ROLE = "role";
    /** Claim portant l'identifiant d'entreprise ; absent/null pour le SUPER_ADMIN. */
    public static final String CLAIM_ENTREPRISE_ID = "entrepriseId";

    /**
     * Vérifie que le secret de signature JWT est bien défini et suffisamment long.
     * Sans secret explicite, l'application refuse de démarrer (pas de valeur par défaut).
     */
    @PostConstruct
    void validateSecret() {
        if (secret == null || secret.isBlank()) {
            throw new IllegalStateException(
                "jwt.secret n'est pas défini : définissez la variable d'environnement JWT_SECRET.");
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                "jwt.secret doit faire au moins 32 octets (HMAC-SHA256). JWT_SECRET trop court.");
        }
        getSigningKey();
    }

    /**
     * Génère une clé secrète à partir de la chaîne de caractères
     */
    private SecretKey getSigningKey() {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    /**
     * Génère un token JWT pour un utilisateur
     */
    public String generateToken(String username, Map<String, Object> extraClaims) {
        Map<String, Object> claims = new HashMap<>(extraClaims);
        claims.put("username", username);
        
        return Jwts.builder()
                .claims(claims)
                .subject(username)
                .issuedAt(new Date(System.currentTimeMillis()))
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey())
                .compact();
    }

    /**
     * Génère un token JWT simple avec juste le username
     */
    public String generateToken(String username) {
        return generateToken(username, new HashMap<>());
    }

    /**
     * Extrait le username du token
     */
    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    /**
     * Extrait le role du token (SUPER_ADMIN | ADMIN | USER), ou {@code null}.
     */
    public String extractRole(String token) {
        return extractClaim(token, claims -> claims.get(CLAIM_ROLE, String.class));
    }

    /**
     * Extrait l'identifiant d'entreprise du token, ou {@code null} pour un SUPER_ADMIN.
     */
    public Long extractEntrepriseId(String token) {
        Object value = extractClaim(token, claims -> claims.get(CLAIM_ENTREPRISE_ID));
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.valueOf(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Extrait la date d'expiration du token
     */
    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    /**
     * Extrait une claim spécifique du token
     */
    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    /**
     * Extrait toutes les claims du token
     */
    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * Vérifie si le token est expiré
     */
    private Boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    /**
     * Valide un token pour un utilisateur donné
     */
    public Boolean validateToken(String token, String username) {
        final String tokenUsername = extractUsername(token);
        return (tokenUsername.equals(username) && !isTokenExpired(token));
    }

    /**
     * Valide un token (sans vérifier le username)
     */
    public Boolean validateToken(String token) {
        try {
            return !isTokenExpired(token);
        } catch (Exception e) {
            return false;
        }
    }
}

