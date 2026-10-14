package com.reconciliation.security;

import com.reconciliation.util.PasswordPolicyValidator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordPolicyValidatorTest {

    @Test
    @DisplayName("Accepte un mot de passe conforme")
    void acceptsValid() {
        assertThat(PasswordPolicyValidator.isValid("Str0ng!Pass")).isTrue();
    }

    @Test
    @DisplayName("Refuse les mots de passe faibles")
    void rejectsWeak() {
        assertThat(PasswordPolicyValidator.isValid(null)).isFalse();
        assertThat(PasswordPolicyValidator.isValid("court1!")).isFalse();      // < 8
        assertThat(PasswordPolicyValidator.isValid("lowercase1!")).isFalse();  // pas de majuscule
        assertThat(PasswordPolicyValidator.isValid("UPPERCASE1!")).isFalse();  // pas de minuscule
        assertThat(PasswordPolicyValidator.isValid("NoDigits!!")).isFalse();   // pas de chiffre
        assertThat(PasswordPolicyValidator.isValid("NoSpecial1")).isFalse();   // pas de spécial
    }
}