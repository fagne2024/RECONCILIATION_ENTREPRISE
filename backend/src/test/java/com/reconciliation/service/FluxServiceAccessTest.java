package com.reconciliation.service;

import com.reconciliation.entity.CompteEntity;
import com.reconciliation.repository.CompteRepository;
import com.reconciliation.repository.FluxRepository;
import com.reconciliation.util.RequestContextUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FluxServiceAccessTest {

    @Mock
    private FluxRepository fluxRepository;
    @Mock
    private CompteRepository compteRepository;
    @Mock
    private PaysFilterService paysFilterService;
    @InjectMocks
    private FluxService fluxService;

    @Test
    void deniesWhenAgencyPaysOutsideProfile() {
        try (MockedStatic<RequestContextUtil> mocked = mockStatic(RequestContextUtil.class)) {
            mocked.when(RequestContextUtil::getUsernameFromRequest).thenReturn("user-sn");
            when(paysFilterService.getAllowedPaysCodes("user-sn")).thenReturn(List.of("SN"));
            CompteEntity cm = new CompteEntity();
            cm.setPays("CM");
            when(compteRepository.findByAgency("AG1")).thenReturn(List.of(cm));
            assertThat(fluxService.canAccessAgence("AG1")).isFalse();
        }
    }

    @Test
    void allowsWhenAgencyPaysMatchesProfile() {
        try (MockedStatic<RequestContextUtil> mocked = mockStatic(RequestContextUtil.class)) {
            mocked.when(RequestContextUtil::getUsernameFromRequest).thenReturn("user-sn");
            when(paysFilterService.getAllowedPaysCodes("user-sn")).thenReturn(List.of("SN"));
            CompteEntity sn = new CompteEntity();
            sn.setPays("SN");
            when(compteRepository.findByAgency("AG1")).thenReturn(List.of(sn));
            assertThat(fluxService.canAccessAgence("AG1")).isTrue();
        }
    }

    @Test
    void allowsGlobalPaysAccess() {
        try (MockedStatic<RequestContextUtil> mocked = mockStatic(RequestContextUtil.class)) {
            mocked.when(RequestContextUtil::getUsernameFromRequest).thenReturn("admin");
            when(paysFilterService.getAllowedPaysCodes("admin")).thenReturn(null);
            assertThat(fluxService.canAccessAgence("AG1")).isTrue();
        }
    }
}
