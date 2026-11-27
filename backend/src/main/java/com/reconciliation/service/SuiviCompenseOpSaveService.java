package com.reconciliation.service;

import com.reconciliation.entity.SuiviCompenseOpEntity;
import com.reconciliation.repository.SuiviCompenseOpRepository;
import com.reconciliation.util.BankingDedupKey;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Enregistrement des lignes du suivi des compenses OP sans doublon, commun à l'import
 * manuel (fichier chargé) et à la synchronisation SharePoint planifiée.
 *
 * <p>Doublon : même clé métier (la référence ; sans référence, date + agence ou service
 * + montant + banque) déjà en base ou répétée dans le lot, ou référence déjà enregistrée.</p>
 */
@Service
public class SuiviCompenseOpSaveService {

    private final SuiviCompenseOpRepository repository;

    public SuiviCompenseOpSaveService(SuiviCompenseOpRepository repository) {
        this.repository = repository;
    }

    /** Bilan d'un enregistrement. */
    public record SaveResult(int totalRead, int saved, int duplicatesIgnored, List<SuiviCompenseOpEntity> savedRows) {}

    /** Clé de doublon d'une ligne : la référence ; sinon date + agence (ou service) + montant + banque. */
    public static String dedupKey(SuiviCompenseOpEntity e) {
        String ref = e.getReference();
        return ref != null && !ref.isBlank()
                ? BankingDedupKey.of("REF", ref)
                : BankingDedupKey.of("AMT", e.getDateOperation(),
                        SuiviCompenseOpImportService.agenceOuService(e), e.getMontant(), e.getBanque());
    }

    @Transactional
    public SaveResult saveWithoutDuplicates(List<SuiviCompenseOpEntity> rows, String sourceFilename) {
        LocalDateTime now = LocalDateTime.now();
        Map<String, SuiviCompenseOpEntity> candidates = new LinkedHashMap<>();
        int duplicates = 0;
        for (SuiviCompenseOpEntity e : rows) {
            e.setSourceFilename(sourceFilename);
            e.setUploadedAt(now);
            e.setDedupKey(dedupKey(e));
            if (candidates.putIfAbsent(e.getDedupKey(), e) != null) {
                duplicates++;
            }
        }
        Set<String> known = new HashSet<>();
        if (!candidates.isEmpty()) {
            List<String> keys = new ArrayList<>(candidates.keySet());
            for (int i = 0; i < keys.size(); i += 1000) {
                for (SuiviCompenseOpEntity ex : repository.findByDedupKeyIn(keys.subList(i, Math.min(i + 1000, keys.size())))) {
                    known.add(ex.getDedupKey());
                }
            }
        }
        // Références déjà enregistrées : une même référence ne doit pas exister deux fois
        Set<String> fileReferences = new LinkedHashSet<>();
        for (SuiviCompenseOpEntity e : candidates.values()) {
            if (e.getReference() != null && !e.getReference().isBlank()) fileReferences.add(e.getReference().trim());
        }
        Set<String> knownRefs = new HashSet<>();
        List<String> refList = new ArrayList<>(fileReferences);
        for (int i = 0; i < refList.size(); i += 1000) {
            for (SuiviCompenseOpEntity ex : repository.findByReferenceIn(refList.subList(i, Math.min(i + 1000, refList.size())))) {
                knownRefs.add(BankingDedupKey.normalizeText(ex.getReference()));
            }
        }
        List<SuiviCompenseOpEntity> toSave = new ArrayList<>();
        for (Map.Entry<String, SuiviCompenseOpEntity> entry : candidates.entrySet()) {
            SuiviCompenseOpEntity e = entry.getValue();
            boolean hasRef = e.getReference() != null && !e.getReference().isBlank();
            if (known.contains(entry.getKey())
                    || (hasRef && !knownRefs.add(BankingDedupKey.normalizeText(e.getReference())))) {
                duplicates++;
            } else {
                toSave.add(e);
            }
        }
        List<SuiviCompenseOpEntity> saved = toSave.isEmpty() ? List.of() : repository.saveAll(toSave);
        return new SaveResult(rows.size(), toSave.size(), duplicates, saved);
    }
}
