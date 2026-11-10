package com.reconciliation.service;

import com.reconciliation.entity.ModelColumnEquivalenceEntity;
import com.reconciliation.repository.AutoProcessingModelRepository;
import com.reconciliation.repository.ModelColumnEquivalenceRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Configuration &gt; Normalisation modèle : en-têtes équivalents des colonnes par défaut
 * de chaque modèle de traitement. Les données sont cloisonnées par entreprise (@TenantId).
 */
@Service
public class ModelColumnEquivalenceService {

    /** Une colonne par défaut et ses en-têtes équivalents (format d'échange API). */
    public record ColumnEquivalence(String columnName, List<String> equivalents) {}

    @Autowired
    private ModelColumnEquivalenceRepository repository;

    @Autowired
    private AutoProcessingModelRepository modelRepository;

    @Transactional(readOnly = true)
    public List<ModelColumnEquivalenceEntity> findAll() {
        return repository.findAllByOrderByModelIdAscColumnNameAsc();
    }

    @Transactional(readOnly = true)
    public List<ModelColumnEquivalenceEntity> findByModel(String modelId) {
        return repository.findByModelIdOrderByColumnNameAsc(requireModelId(modelId));
    }

    /**
     * Remplace l'ensemble des équivalences d'un modèle : les colonnes absentes de la liste
     * sont supprimées, les autres créées ou mises à jour (pas de suppression/réinsertion,
     * pour ne pas heurter la contrainte d'unicité dans le même flush).
     */
    @Transactional
    public List<ModelColumnEquivalenceEntity> replaceForModel(String modelId, List<ColumnEquivalence> items) {
        String id = requireModelId(modelId);
        if (!modelRepository.existsByModelId(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Modèle introuvable : " + id);
        }
        Map<String, ColumnEquivalence> cleaned = validate(items == null ? List.of() : items);

        Map<String, ModelColumnEquivalenceEntity> existing = new HashMap<>();
        for (ModelColumnEquivalenceEntity entity : repository.findByModelIdOrderByColumnNameAsc(id)) {
            existing.put(normalize(entity.getColumnName()), entity);
        }

        List<ModelColumnEquivalenceEntity> toDelete = new ArrayList<>();
        for (Map.Entry<String, ModelColumnEquivalenceEntity> entry : existing.entrySet()) {
            if (!cleaned.containsKey(entry.getKey())) {
                toDelete.add(entry.getValue());
            }
        }
        repository.deleteAll(toDelete);

        List<ModelColumnEquivalenceEntity> toSave = new ArrayList<>();
        for (Map.Entry<String, ColumnEquivalence> entry : cleaned.entrySet()) {
            ModelColumnEquivalenceEntity entity = existing.get(entry.getKey());
            if (entity == null) {
                entity = new ModelColumnEquivalenceEntity();
                entity.setModelId(id);
            }
            entity.setColumnName(entry.getValue().columnName());
            entity.setEquivalents(entry.getValue().equivalents());
            toSave.add(entity);
        }
        repository.saveAll(toSave);
        return repository.findByModelIdOrderByColumnNameAsc(id);
    }

    /**
     * Nettoie et contrôle la saisie : libellés obligatoires, doublons supprimés,
     * un en-tête ne peut pas être à la fois colonne par défaut et équivalent,
     * ni équivalent de deux colonnes différentes (le renommage serait ambigu).
     * Les colonnes sans équivalent ne sont pas conservées.
     */
    Map<String, ColumnEquivalence> validate(List<ColumnEquivalence> items) {
        Map<String, ColumnEquivalence> result = new LinkedHashMap<>();
        Map<String, String> owners = new HashMap<>();
        for (ColumnEquivalence item : items) {
            String column = item == null || item.columnName() == null ? "" : item.columnName().trim();
            if (column.isEmpty()) {
                throw badRequest("Le nom de la colonne par défaut est obligatoire.");
            }
            String key = normalize(column);
            if (result.containsKey(key)) {
                throw badRequest("La colonne « " + column + " » est déclarée plusieurs fois.");
            }
            owners.put(key, column);
            result.put(key, new ColumnEquivalence(column, new ArrayList<>()));
        }

        for (ColumnEquivalence item : items) {
            String column = item.columnName().trim();
            String key = normalize(column);
            Set<String> seen = new LinkedHashSet<>();
            List<String> equivalents = result.get(key).equivalents();
            for (String raw : item.equivalents() == null ? List.<String>of() : item.equivalents()) {
                String equivalent = raw == null ? "" : raw.trim();
                String eqKey = normalize(equivalent);
                if (equivalent.isEmpty() || eqKey.equals(key) || !seen.add(eqKey)) {
                    continue;
                }
                String owner = owners.get(eqKey);
                if (owner != null && !owner.equals(column)) {
                    throw badRequest("L'en-tête « " + equivalent + " » est déjà "
                            + (result.containsKey(eqKey) ? "une colonne par défaut" : "équivalent de « " + owner + " »")
                            + " : il ne peut pas aussi être équivalent de « " + column + " ».");
                }
                owners.put(eqKey, column);
                equivalents.add(equivalent);
            }
        }
        result.values().removeIf(item -> item.equivalents().isEmpty());
        return result;
    }

    /** Même normalisation que le frontend : casse, accents et espaces ignorés. */
    static String normalize(String value) {
        if (value == null) {
            return "";
        }
        String noAccents = Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return noAccents.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private static String requireModelId(String modelId) {
        if (modelId == null || modelId.isBlank()) {
            throw badRequest("L'identifiant du modèle est obligatoire.");
        }
        return modelId.trim();
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
