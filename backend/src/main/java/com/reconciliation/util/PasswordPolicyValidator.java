package com.reconciliation.util;

/**
 * Politique de mot de passe : 8+ caractères, au moins une minuscule, une majuscule,
 * un chiffre et un caractère spécial.
 */
public final class PasswordPolicyValidator {

    private PasswordPolicyValidator() {
        // classe utilitaire statique
    }

    public static boolean isValid(String password) {
        if (password == null || password.length() < 8) {
            return false;
        }
        boolean hasLower = false;
        boolean hasUpper = false;
        boolean hasDigit = false;
        boolean hasSpecial = false;
        for (int i = 0; i < password.length(); i++) {
            char c = password.charAt(i);
            if (Character.isLowerCase(c)) {
                hasLower = true;
            } else if (Character.isUpperCase(c)) {
                hasUpper = true;
            } else if (Character.isDigit(c)) {
                hasDigit = true;
            } else {
                hasSpecial = true;
            }
        }
        return hasLower && hasUpper && hasDigit && hasSpecial;
    }

    public static String reason(String password) {
        if (password == null || password.length() < 8) {
            return "Le mot de passe doit contenir au moins 8 caractères.";
        }
        return "Le mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial.";
    }
}