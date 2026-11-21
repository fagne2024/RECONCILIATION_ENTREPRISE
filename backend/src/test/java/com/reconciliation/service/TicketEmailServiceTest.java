package com.reconciliation.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class TicketEmailServiceTest {

    private TicketEmailService.TicketEmailRequest request(List<String> to, List<String> cc, String objet, String message) {
        TicketEmailService.TicketEmailRequest r = new TicketEmailService.TicketEmailRequest();
        r.destinataires = to;
        r.copie = cc;
        r.objet = objet;
        r.message = message;
        return r;
    }

    @Test
    @SuppressWarnings("unchecked")
    void envoieUnSeulMessageAvecCopieSansDoublonEtObjetSurUneLigne() {
        EmailService email = mock(EmailService.class);
        TicketEmailService service = new TicketEmailService(email);

        TicketEmailService.Result result = service.send(
                request(List.of("a@x.com", "pas-une-adresse"), List.of("a@x.com", "b@x.com"), "Ticket 12\r\nBcc: pirate@x.com", "Bonjour"),
                "agent", "défaut");

        assertEquals(200, result.status());
        ArgumentCaptor<List<String>> to = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<List<String>> cc = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(email).sendClientVolumeAlertEmail(to.capture(), cc.capture(), subject.capture(), body.capture());
        assertEquals(List.of("a@x.com"), to.getValue());
        assertEquals(List.of("b@x.com"), cc.getValue());
        assertFalse(subject.getValue().contains("\n"));
        assertTrue(body.getValue().startsWith("Bonjour"));
        assertTrue(body.getValue().contains("agent"));
    }

    @Test
    void refuseSansDestinataireOuNonAuthentifie() {
        EmailService email = mock(EmailService.class);
        TicketEmailService service = new TicketEmailService(email);

        assertEquals(400, service.send(request(List.of(), List.of("b@x.com"), "o", "m"), "agent", "d").status());
        assertEquals(401, service.send(request(List.of("a@x.com"), null, "o", "m"), null, "d").status());
        assertEquals(400, service.send(request(List.of("a@x.com"), null, "o", "  "), "agent", "d").status());
        verify(email, never()).sendClientVolumeAlertEmail(anyList(), anyList(), anyString(), anyString());
    }

    @Test
    void objetParDefautEtEchecSmtpRenvoie502() {
        EmailService email = mock(EmailService.class);
        doThrow(new IllegalStateException("SMTP")).when(email)
                .sendClientVolumeAlertEmail(anyList(), anyList(), any(), anyString());
        TicketEmailService service = new TicketEmailService(email);

        assertEquals(502, service.send(request(List.of("a@x.com"), null, "", "m"), "agent", "Opération bancaire en suspens").status());
        verify(email).sendClientVolumeAlertEmail(anyList(), anyList(), org.mockito.ArgumentMatchers.eq("Opération bancaire en suspens"), anyString());
    }
}
