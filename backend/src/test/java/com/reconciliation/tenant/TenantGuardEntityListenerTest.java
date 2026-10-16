package com.reconciliation.tenant;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TenantGuardEntityListenerTest {

    static class GuardedEntity {
        private Long entrepriseId = 1L;
    }

    private final TenantGuardEntityListener listener = new TenantGuardEntityListener();

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void rejectsLoadWithoutTenantContext() {
        TenantContext.clear();
        assertThatThrownBy(() -> listener.checkTenant(new GuardedEntity()))
            .isInstanceOf(TenantAccessException.class);
    }

    @Test
    void rejectsLoadFromAnotherTenant() {
        TenantContext.set(2L);
        assertThatThrownBy(() -> listener.checkTenant(new GuardedEntity()))
            .isInstanceOf(TenantAccessException.class);
    }

    @Test
    void allowsLoadForMatchingTenant() {
        TenantContext.set(1L);
        assertThatCode(() -> listener.checkTenant(new GuardedEntity()))
            .doesNotThrowAnyException();
    }
}
