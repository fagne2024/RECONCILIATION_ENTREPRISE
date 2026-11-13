package com.reconciliation.service;

import com.reconciliation.dto.ClientVolumeAlertRequest;
import org.springframework.stereotype.Service;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Alerte « volume par client » : valide les destinataires, génère automatiquement
 * l'objet et le corps du mail puis délègue l'envoi à {@link EmailService}.
 */
@Service
public class ClientVolumeAlertService {

    static final int MAX_RECIPIENTS = 20;
    /** Nombre maximal de numéros détaillés dans le corps du mail (le reste est résumé). */
    static final int MAX_DETAIL_LINES = 100;
    private static final int MAX_ENTRIES = 5000;
    private static final Pattern EMAIL =
        Pattern.compile("^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final EmailService emailService;

    public ClientVolumeAlertService(EmailService emailService) {
        this.emailService = emailService;
    }

    /** @return le nombre de destinataires (To + Cc) auxquels l'alerte a été envoyée. */
    public int send(ClientVolumeAlertRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Requête vide.");
        }
        List<String> to = normalizeRecipients(request.getTo());
        List<String> cc = normalizeRecipients(request.getCc());
        cc.removeAll(to);
        if (to.isEmpty()) {
            throw new IllegalArgumentException("Au moins un destinataire est requis.");
        }
        if (to.size() + cc.size() > MAX_RECIPIENTS) {
            throw new IllegalArgumentException("Trop de destinataires (maximum " + MAX_RECIPIENTS + ").");
        }
        List<ClientVolumeAlertRequest.Entry> entries = request.getEntries();
        if (entries == null || entries.isEmpty()) {
            throw new IllegalArgumentException("Aucun numéro à signaler.");
        }
        if (entries.size() > MAX_ENTRIES) {
            throw new IllegalArgumentException("Trop de numéros à signaler.");
        }

        emailService.sendClientVolumeAlertEmail(to, cc, buildSubject(request), buildBody(request));
        return to.size() + cc.size();
    }

    static List<String> normalizeRecipients(List<String> raw) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        if (raw != null) {
            for (String item : raw) {
                if (item == null) {
                    continue;
                }
                String email = item.trim();
                if (email.isEmpty()) {
                    continue;
                }
                // Le motif exclut espaces, CR et LF : pas d'injection d'en-têtes.
                if (!EMAIL.matcher(email).matches()) {
                    throw new IllegalArgumentException("Adresse e-mail invalide : " + sanitize(email));
                }
                out.add(email);
            }
        }
        return new ArrayList<>(out);
    }

    static String buildSubject(ClientVolumeAlertRequest r) {
        int n = r.getEntries().size();
        StringBuilder sb = new StringBuilder("[ALERTE] Volume de transactions anormal - ")
            .append(n).append(n > 1 ? " numéros clients" : " numéro client")
            .append(" - ").append(sourceLabel(r.getSource()));
        String service = sanitize(r.getServiceFilter());
        if (!service.isEmpty()) {
            sb.append(" - ").append(service);
        }
        return sb.toString();
    }

    static String buildBody(ClientVolumeAlertRequest r) {
        List<ClientVolumeAlertRequest.Entry> entries = r.getEntries();
        int n = entries.size();
        NumberFormat nf = NumberFormat.getNumberInstance(Locale.FRANCE);
        nf.setMaximumFractionDigits(2);

        StringBuilder b = new StringBuilder();
        b.append("Bonjour,\n\n");
        b.append("Une alerte a été détectée lors du contrôle du volume par client (")
            .append(sourceLabel(r.getSource())).append(") : ")
            .append(n).append(n > 1 ? " numéros présentent" : " numéro présente")
            .append(" un nombre de transactions anormal.\n\n");

        if (r.getMinOccurrences() != null && r.getMinVolume() != null) {
            b.append("Règle appliquée : numéro présent plus de ").append(r.getMinOccurrences())
                .append(" fois et volume cumulé supérieur ou égal à ")
                .append(fmt(nf, r.getMinVolume())).append(".\n");
        }
        String service = sanitize(r.getServiceFilter());
        if (!service.isEmpty()) {
            b.append("Service concerné : ").append(service).append("\n");
        }
        if (r.getAnalyzedRows() != null) {
            b.append("Lignes analysées : ").append(fmt(nf, r.getAnalyzedRows()));
            if (r.getDistinctPhones() != null) {
                b.append(" (").append(fmt(nf, r.getDistinctPhones())).append(" numéros distincts)");
            }
            b.append("\n");
        }

        b.append("\nDétail des numéros concernés :\n");
        int shown = Math.min(n, MAX_DETAIL_LINES);
        for (int i = 0; i < shown; i++) {
            ClientVolumeAlertRequest.Entry e = entries.get(i);
            b.append(String.format("%d. %s - %s transaction(s) - volume cumulé : %s",
                i + 1,
                sanitize(e.getPhone()),
                e.getOccurrences() == null ? "?" : e.getOccurrences().toString(),
                e.getVolume() == null ? "?" : fmt(nf, e.getVolume())));
            List<String> services = e.getServices();
            if (services != null && !services.isEmpty()) {
                List<String> clean = new ArrayList<>();
                for (String s : services) {
                    String c = sanitize(s);
                    if (!c.isEmpty()) {
                        clean.add(c);
                    }
                }
                if (!clean.isEmpty()) {
                    b.append(" - services : ").append(String.join(", ", clean));
                }
            }
            b.append("\n");
        }
        if (n > shown) {
            b.append("... et ").append(n - shown).append(" autre(s) numéro(s) non détaillé(s).\n");
        }

        b.append("\nMerci de vérifier ces transactions et de revenir vers nous en cas d'anomalie confirmée.\n\n");
        b.append("Cordialement,\nReconciliApp");
        return b.toString();
    }

    private static String sourceLabel(String source) {
        if ("partner".equalsIgnoreCase(source)) {
            return "Partenaire";
        }
        return "BO (Back Office)";
    }

    private static String fmt(NumberFormat nf, Number value) {
        // Les espaces insécables fines du format français s'affichent mal en texte brut.
        return nf.format(value).replace(' ', ' ').replace(' ', ' ');
    }

    /** Neutralise retours à la ligne et caractères de contrôle dans les valeurs issues du client. */
    private static String sanitize(String value) {
        if (value == null) {
            return "";
        }
        String s = value.replaceAll("[\\p{Cntrl}]+", " ").trim();
        return s.length() > 200 ? s.substring(0, 200) : s;
    }
}
