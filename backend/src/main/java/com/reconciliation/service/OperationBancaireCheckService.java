package com.reconciliation.service;

import com.reconciliation.entity.OperationBancaireEntity;
import com.reconciliation.entity.ReleveBancaireEntity;
import com.reconciliation.entity.SuiviCompenseOpEntity;
import com.reconciliation.repository.OperationBancaireRepository;
import com.reconciliation.repository.ReleveBancaireRepository;
import com.reconciliation.repository.SuiviCompenseOpRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;

/**
 * Check des opérations bancaires par type.
 *
 * <ul>
 *   <li>Compensation : chaque opération est comparée aux suivis compense OP sur date, agence
 *       et montant. Une correspondance fournit la banque et la référence, qui pourront être
 *       reportées sur l'opération via {@link #apply(List)}.</li>
 *   <li>Autres types (approvisionnement, appro-distributeur…) : simple contrôle de
 *       correspondance avec le relevé bancaire (date et montant), sans validation.</li>
 * </ul>
 *
 * <p>Une ligne de suivi ou de relevé ne sert qu'à une seule opération.</p>
 */
@Service
public class OperationBancaireCheckService {

    @Autowired
    private OperationBancaireRepository operationRepository;
    @Autowired
    private SuiviCompenseOpRepository suiviRepository;
    @Autowired
    private ReleveBancaireRepository releveRepository;
    @Autowired
    private OperationBancaireAuditService auditService;

    public record CheckRow(Long operationId, String dateOperation, String agence, Double montant,
                           String typeOperation, String status, String banque, String reference) {}

    public record CheckResult(String type, boolean compensation, int total, int matched, int gaps,
                              List<CheckRow> rows) {}

    public record ApplyItem(Long operationId, String banque, String reference) {}

    /** Vrai pour les types de compensation (même règle de libellé que le frontend). */
    public static boolean isCompensation(String type) {
        return normalize(type).contains("COMPENS");
    }

    public CheckResult check(String type) {
        boolean compensation = isCompensation(type);
        List<OperationBancaireEntity> ops = new ArrayList<>();
        for (OperationBancaireEntity op : operationRepository.findAll()) {
            // Une opération déjà validée par un check ne réapparaît plus.
            if (type != null && type.equals(op.getTypeOperation()) && !Boolean.TRUE.equals(op.getCheckValide())) {
                ops.add(op);
            }
        }
        ops.sort(Comparator.comparing(OperationBancaireEntity::getDateOperation,
                Comparator.nullsLast(Comparator.naturalOrder())));

        List<CheckRow> rows = compensation ? checkCompense(ops) : checkReleve(ops);
        int matched = (int) rows.stream().filter(r -> "MATCH".equals(r.status())).count();
        return new CheckResult(type, compensation, rows.size(), matched, rows.size() - matched, rows);
    }

    private List<CheckRow> checkCompense(List<OperationBancaireEntity> ops) {
        // Références déjà validées : la ligne de suivi correspondante ne sert plus à un autre check.
        Set<String> validatedRefs = new HashSet<>();
        for (OperationBancaireEntity op : operationRepository.findAll()) {
            if (Boolean.TRUE.equals(op.getCheckValide()) && op.getReference() != null) {
                validatedRefs.add(op.getReference());
            }
        }
        Map<String, Deque<SuiviCompenseOpEntity>> suivis = new HashMap<>();
        for (SuiviCompenseOpEntity s : suiviRepository.findAll()) {
            if (s.getDateOperation() == null || s.getMontant() == null) continue;
            if (s.getReference() != null && validatedRefs.contains(s.getReference())) continue;
            // Compense distributeur : code agence ; compense fournisseur : service (colonnes exclusives).
            suivis.computeIfAbsent(key(s.getDateOperation(), SuiviCompenseOpImportService.agenceOuService(s), s.getMontant()),
                    k -> new ArrayDeque<>()).add(s);
        }
        List<CheckRow> rows = new ArrayList<>();
        for (OperationBancaireEntity op : ops) {
            Deque<SuiviCompenseOpEntity> candidates = op.getDateOperation() == null || op.getMontant() == null
                    ? null
                    : suivis.get(key(op.getDateOperation().toLocalDate(), op.getAgence(), op.getMontant()));
            if (candidates != null && !candidates.isEmpty()) {
                SuiviCompenseOpEntity s = candidates.poll();
                rows.add(row(op, "MATCH", s.getBanque(), s.getReference()));
            } else {
                rows.add(row(op, "ECART", null, null));
            }
        }
        return rows;
    }

    private List<CheckRow> checkReleve(List<OperationBancaireEntity> ops) {
        Map<String, Deque<ReleveBancaireEntity>> byComptable = new HashMap<>();
        Map<String, Deque<ReleveBancaireEntity>> byValeur = new HashMap<>();
        for (ReleveBancaireEntity r : releveRepository.findAll()) {
            Double amount = releveAmount(r);
            if (amount == null) continue;
            if (r.getDateComptable() != null) {
                byComptable.computeIfAbsent(amountKey(r.getDateComptable(), amount), k -> new ArrayDeque<>()).add(r);
            }
            if (r.getDateValeur() != null) {
                byValeur.computeIfAbsent(amountKey(r.getDateValeur(), amount), k -> new ArrayDeque<>()).add(r);
            }
        }
        Set<Long> used = new HashSet<>();
        List<CheckRow> rows = new ArrayList<>();
        for (OperationBancaireEntity op : ops) {
            ReleveBancaireEntity match = null;
            if (op.getDateOperation() != null && op.getMontant() != null) {
                LocalDate d = op.getDateOperation().toLocalDate();
                match = takeUnused(byComptable.get(amountKey(d, op.getMontant())), used);
                if (match == null) {
                    match = takeUnused(byValeur.get(amountKey(d, op.getMontant())), used);
                }
            }
            if (match != null) {
                rows.add(row(op, "MATCH", match.getBanque(), null));
            } else {
                rows.add(row(op, "ECART", null, null));
            }
        }
        return rows;
    }

    private static ReleveBancaireEntity takeUnused(Deque<ReleveBancaireEntity> candidates, Set<Long> used) {
        if (candidates == null) return null;
        while (!candidates.isEmpty()) {
            ReleveBancaireEntity r = candidates.poll();
            if (used.add(r.getId())) return r;
        }
        return null;
    }

    /** Montant du relevé en valeur absolue : montant, sinon débit, sinon crédit. */
    private static Double releveAmount(ReleveBancaireEntity r) {
        Double v = r.getMontant() != null ? r.getMontant()
                : r.getDebit() != null ? r.getDebit() : r.getCredit();
        return v == null ? null : Math.abs(v);
    }

    @Transactional
    public int apply(List<ApplyItem> items) {
        if (items == null || items.isEmpty()) return 0;
        Map<Long, ApplyItem> byId = new LinkedHashMap<>();
        for (ApplyItem item : items) {
            if (item.operationId() != null) byId.put(item.operationId(), item);
        }
        // Seules les opérations de compensation sont concernées par la validation.
        List<OperationBancaireEntity> toUpdate = new ArrayList<>();
        for (OperationBancaireEntity op : operationRepository.findAllById(byId.keySet())) {
            if (!isCompensation(op.getTypeOperation())) continue;
            ApplyItem item = byId.get(op.getId());
            if (item.banque() != null && !item.banque().isBlank()) op.setBo(item.banque());
            if (item.reference() != null && !item.reference().isBlank()) op.setReference(item.reference());
            op.setCheckValide(true);
            auditService.log(op, OperationBancaireAuditService.CONTROLE_BANQUE,
                    "Contrôle validé" + (item.banque() != null && !item.banque().isBlank() ? " — banque : " + item.banque() : "")
                            + (item.reference() != null && !item.reference().isBlank() ? " — référence : " + item.reference() : ""));
            toUpdate.add(op);
        }
        operationRepository.saveAll(toUpdate);
        return toUpdate.size();
    }

    private static CheckRow row(OperationBancaireEntity op, String status, String banque, String reference) {
        return new CheckRow(op.getId(),
                op.getDateOperation() == null ? null : op.getDateOperation().toLocalDate().toString(),
                op.getAgence(), op.getMontant(), op.getTypeOperation(), status, banque, reference);
    }

    private static String key(LocalDate date, String agence, Double montant) {
        return date + "|" + normalize(agence) + "|" + amount(montant);
    }

    private static String amountKey(LocalDate date, Double montant) {
        return date + "|" + amount(montant);
    }

    private static String amount(Double montant) {
        return BigDecimal.valueOf(Math.abs(montant)).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static String normalize(String s) {
        if (s == null) return "";
        return java.text.Normalizer.normalize(s, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "")
                .trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
    }
}
