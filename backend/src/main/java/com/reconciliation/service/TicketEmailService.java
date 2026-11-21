package com.reconciliation.service;

import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * E-mail proposé après la saisie d'un ID ticket (écarts de réconciliation transactions,
 * opération bancaire en suspens). Un seul message : destinataires en « À », les autres en copie.
 */
@Service
public class TicketEmailService {

    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s,;]+@[^@\\s,;]+\\.[^@\\s,;]+$");
    private static final int MAX_DESTINATAIRES = 30;
    private static final int MAX_MESSAGE = 20000;

    private final EmailService emailService;

    public TicketEmailService(EmailService emailService) {
        this.emailService = emailService;
    }

    /** Corps de la requête envoyée par l'écran (le message est rédigé et relu par l'utilisateur). */
    public static class TicketEmailRequest {
        public List<String> destinataires;
        public List<String> copie;
        public String objet;
        public String message;
    }

    /** Résultat : statut HTTP et corps de réponse. */
    public record Result(int status, Map<String, Object> body) { }

    public Result send(TicketEmailRequest request, String username, String objetParDefaut) {
        if (username == null || username.isBlank()) {
            return new Result(401, Map.of("message", "Non authentifié"));
        }
        if (request == null) {
            return new Result(400, Map.of("message", "Requête vide"));
        }
        Set<String> to = adresses(request.destinataires);
        Set<String> cc = adresses(request.copie);
        cc.removeAll(to);
        if (to.isEmpty()) {
            return new Result(400, Map.of("message", "Aucun destinataire valide"));
        }
        if (to.size() + cc.size() > MAX_DESTINATAIRES) {
            return new Result(400, Map.of("message", "Trop de destinataires"));
        }
        String objet = ligneUnique(request.objet);
        if (objet.isEmpty()) {
            objet = objetParDefaut;
        }
        String message = request.message == null ? "" : request.message.trim();
        if (message.isEmpty()) {
            return new Result(400, Map.of("message", "Message vide"));
        }
        if (message.length() > MAX_MESSAGE) {
            message = message.substring(0, MAX_MESSAGE);
        }
        String body = message
                + "\n\n--\nEnvoyé depuis ReconciliApp par " + username
                + " le " + LocalDateTime.now().toString().replace('T', ' ').substring(0, 19);
        try {
            emailService.sendClientVolumeAlertEmail(new ArrayList<>(to), new ArrayList<>(cc), objet, body);
        } catch (Exception e) {
            return new Result(502, Map.of("message", "E-mail non envoyé : " + e.getMessage(), "envoyes", 0));
        }
        return new Result(200, Map.of("envoyes", to.size() + cc.size(), "destinataires", to.size(), "copie", cc.size()));
    }

    private static Set<String> adresses(List<String> list) {
        Set<String> out = new LinkedHashSet<>();
        if (list == null) {
            return out;
        }
        for (String mail : list) {
            String m = mail == null ? "" : mail.trim();
            if (EMAIL_PATTERN.matcher(m).matches()) {
                out.add(m);
            }
        }
        return out;
    }

    /** Objet du mail : une seule ligne, longueur bornée (évite l'injection d'en-têtes). */
    private static String ligneUnique(String value) {
        if (value == null) {
            return "";
        }
        String v = value.replaceAll("[\\r\\n\\t]+", " ").trim();
        return v.length() > 200 ? v.substring(0, 200) : v;
    }
}
