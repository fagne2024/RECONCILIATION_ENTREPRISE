package com.reconciliation.service;

import com.reconciliation.dto.ClientVolumeAlertRequest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class ClientVolumeAlertServiceTest {

    private final EmailService emailService = mock(EmailService.class);
    private final ClientVolumeAlertService service = new ClientVolumeAlertService(emailService);

    private ClientVolumeAlertRequest request() {
        ClientVolumeAlertRequest r = new ClientVolumeAlertRequest();
        r.setTo(List.of("a@exemple.com", " a@exemple.com ", "b@exemple.com"));
        r.setCc(List.of("b@exemple.com", "c@exemple.com"));
        r.setSource("bo");
        r.setMinOccurrences(3);
        r.setMinVolume(400000d);
        r.setAnalyzedRows(1200);
        r.setDistinctPhones(300);
        ClientVolumeAlertRequest.Entry e = new ClientVolumeAlertRequest.Entry();
        e.setPhone("237690000000");
        e.setOccurrences(12);
        e.setVolume(1250000d);
        e.setServices(List.of("PAIEMENT", "CASHIN"));
        r.setEntries(List.of(e));
        return r;
    }

    @Test
    @SuppressWarnings("unchecked")
    void envoieAlerteAvecObjetEtCorpsGeneres() {
        int count = service.send(request());

        ArgumentCaptor<List<String>> to = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<List<String>> cc = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emailService).sendClientVolumeAlertEmail(to.capture(), cc.capture(), subject.capture(), body.capture());

        assertEquals(List.of("a@exemple.com", "b@exemple.com"), to.getValue());
        // b@exemple.com est déjà en destinataire principal : retiré de la copie
        assertEquals(List.of("c@exemple.com"), cc.getValue());
        assertEquals(3, count);
        assertTrue(subject.getValue().contains("1 numéro client"));
        assertTrue(subject.getValue().contains("BO"));
        assertTrue(body.getValue().contains("237690000000"));
        assertTrue(body.getValue().contains("12 transaction(s)"));
        assertTrue(body.getValue().contains("PAIEMENT, CASHIN"));
        assertTrue(body.getValue().contains("400 000"));
    }

    @Test
    void refuseAdresseInvalideOuInjectionEnTete() {
        ClientVolumeAlertRequest r = request();
        r.setTo(List.of("a@exemple.com\nBcc: x@evil.com"));
        assertThrows(IllegalArgumentException.class, () -> service.send(r));
        verify(emailService, never()).sendClientVolumeAlertEmail(anyList(), anyList(), anyString(), anyString());
    }

    @Test
    void refuseSansDestinataireOuSansNumero() {
        ClientVolumeAlertRequest r = request();
        r.setTo(List.of(" "));
        assertThrows(IllegalArgumentException.class, () -> service.send(r));

        ClientVolumeAlertRequest r2 = request();
        r2.setEntries(List.of());
        assertThrows(IllegalArgumentException.class, () -> service.send(r2));
    }

    @Test
    void neutraliseLesSautsDeLigneDansLesValeursClient() {
        ClientVolumeAlertRequest r = request();
        r.setServiceFilter("PAIEMENT\r\nBcc: x@evil.com");
        String subject = ClientVolumeAlertService.buildSubject(r);
        assertTrue(!subject.contains("\n") && !subject.contains("\r"));
    }
}
