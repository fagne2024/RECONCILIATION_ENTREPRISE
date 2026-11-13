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

    /** « Point de vérification sur les volumes par client (SERVICE) » ; sans service, la source du fichier. */
    static String buildSubject(ClientVolumeAlertRequest r) {
        String service = sanitize(r.getServiceFilter());
        return "Point de vérification sur les volumes par client ("
            + (service.isEmpty() ? sourceShort(r.getSource()) : service) + ")";
    }

    static String buildBody(ClientVolumeAlertRequest r) {
        List<ClientVolumeAlertRequest.Entry> entries = r.getEntries();
        int n = entries.size();
        NumberFormat nf = NumberFormat.getNumberInstance(Locale.FRANCE);
        nf.setMaximumFractionDigits(2);
        String service = sanitize(r.getServiceFilter());

        StringBuilder b = new StringBuilder();
        b.append("Bonjour,\n\n");
        b.append("Lors du contrôle habituel des volumes par client sur ").append(sourceWhere(r.getSource())).append(", ")
            .append(n > 1 ? "quelques numéros nous ont semblé mériter" : "un numéro nous a semblé mériter")
            .append(" un regard attentif. Il s'agit d'un simple point de vérification, sans conclusion à ce stade.\n\n");

        b.append("Périmètre du contrôle\n\n");
        if (!service.isEmpty()) {
            b.append("Service : ").append(service).append("\n");
        }
        if (r.getAnalyzedRows() != null) {
            b.append("Lignes analysées : ").append(fmt(nf, r.getAnalyzedRows())).append("\n");
        }
        if (r.getMinOccurrences() != null && r.getMinVolume() != null) {
            b.append("Critère retenu : numéro apparaissant plus de ").append(r.getMinOccurrences())
                .append(" fois, avec un volume cumulé d'au moins ").append(fmt(nf, r.getMinVolume())).append("\n");
        }

        b.append("\nNuméros concernés\n\n");
        int shown = Math.min(n, MAX_DETAIL_LINES);
        for (int i = 0; i < shown; i++) {
            ClientVolumeAlertRequest.Entry e = entries.get(i);
            int occ = e.getOccurrences() == null ? 0 : e.getOccurrences();
            b.append(sanitize(e.getPhone())).append(" : ")
                .append(e.getOccurrences() == null ? "?" : String.valueOf(occ))
                .append(occ > 1 ? " transactions" : " transaction")
                .append(", volume cumulé de ")
                .append(e.getVolume() == null ? "?" : fmt(nf, e.getVolume()));
            // Sans filtre de service, les services utilisés par le numéro aident à situer l'activité.
            if (service.isEmpty() && e.getServices() != null) {
                List<String> clean = new ArrayList<>();
                for (String s : e.getServices()) {
                    String c = sanitize(s);
                    if (!c.isEmpty()) {
                        clean.add(c);
                    }
                }
                if (!clean.isEmpty()) {
                    b.append(" (services : ").append(String.join(", ", clean)).append(")");
                }
            }
            b.append("\n");
        }
        if (n > shown) {
            b.append("… et ").append(n - shown).append(" autre(s) numéro(s) non détaillé(s).\n");
        }

        b.append("\nPourriez-vous jeter un œil à ces opérations ? Si quelque chose vous paraît inhabituel, ")
            .append("n'hésitez pas à nous le faire savoir, afin que nous puissions en discuter ensemble.\n\n");
        b.append("Merci d'avance pour votre aide.\n\n");
        b.append("Bien cordialement,\nL'équipe ReconciliApp");
        return b.toString();
    }

    private static boolean isPartner(String source) {
        return "partner".equalsIgnoreCase(source);
    }

    private static String sourceShort(String source) {
        return isPartner(source) ? "Partenaire" : "BO";
    }

    private static String sourceWhere(String source) {
        return isPartner(source) ? "le fichier partenaire" : "le back office";
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
