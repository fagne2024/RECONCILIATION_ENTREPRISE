package com.reconciliation.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.reconciliation.dto.TopUsersCategoryDto;
import com.reconciliation.dto.TopUsersConfigDto;
import com.reconciliation.entity.TopUsersConfigEntity;
import com.reconciliation.repository.TopUsersConfigRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Configuration du bloc « Top des utilisateurs » (Configuration &gt; Top utilisateurs).
 *
 * <p>Une ligne par entreprise ({@code @TenantId}). En l'absence de ligne, la
 * lecture renvoie les valeurs par defaut ({@link TopUsersConfigDto#defaults()})
 * sans rien persister : la configuration n'est creee qu'au premier
 * enregistrement.</p>
 *
 * <p>La liste des categories est stockee serialisee en JSON dans la colonne
 * {@code categories_json}.</p>
 */
@Service
public class TopUsersConfigService {

    /** Bornes du nombre d'utilisateurs affiches par categorie. */
    public static final int MIN_TOP_N = 1;
    public static final int MAX_TOP_N = 10;
    public static final int DEFAULT_TOP_N = 3;

    /** Nombre maximal de categories autorisees. */
    public static final int MAX_CATEGORIES = 12;

    /** Longueur maximale d'un libelle. */
    public static final int MAX_LABEL_LENGTH = 120;

    private static final Set<String> KNOWN_LEVELS =
            Set.of("support", "group", "cdo", "termine");

    @Autowired
    private TopUsersConfigRepository repository;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public TopUsersConfigDto get() {
        return repository.findFirstByOrderByIdAsc()
                .map(this::toDto)
                .orElseGet(TopUsersConfigDto::defaults);
    }

    @Transactional
    public TopUsersConfigDto save(TopUsersConfigDto dto) {
        TopUsersConfigEntity entity = repository.findFirstByOrderByIdAsc()
                .orElseGet(TopUsersConfigEntity::new);
        entity.setEnabled(dto.enabled());
        entity.setTopN(clampTopN(dto.topN()));
        entity.setShowDelta(dto.showDelta());
        entity.setCategoriesJson(serializeCategories(dto.categories()));
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(repository.save(entity));
    }

    private static int clampTopN(int value) {
        if (value < MIN_TOP_N) {
            return MIN_TOP_N;
        }
        if (value > MAX_TOP_N) {
            return MAX_TOP_N;
        }
        return value;
    }

    /** Nettoie un libelle : trim, chaine vide -> null, troncature. */
    private static String sanitizeLabel(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        return trimmed.length() > MAX_LABEL_LENGTH ? trimmed.substring(0, MAX_LABEL_LENGTH) : trimmed;
    }

    /** Normalise une liste de jetons : trim, sans accent, en majuscules, dedupliquee, sans vide. */
    private static List<String> normalizeEvents(List<String> values) {
        Set<String> result = new LinkedHashSet<>();
        if (values != null) {
            for (String value : values) {
                if (value == null) {
                    continue;
                }
                String token = stripAccents(value.trim()).toUpperCase(Locale.ROOT);
                if (!token.isEmpty()) {
                    result.add(token);
                }
            }
        }
        return new ArrayList<>(result);
    }

    /** Normalise les niveaux : majuscules minuscules sans accent, restreints aux niveaux connus. */
    private static List<String> normalizeLevels(List<String> values) {
        Set<String> result = new LinkedHashSet<>();
        if (values != null) {
            for (String value : values) {
                if (value == null) {
                    continue;
                }
                String token = stripAccents(value.trim()).toLowerCase(Locale.ROOT);
                if (KNOWN_LEVELS.contains(token)) {
                    result.add(token);
                }
            }
        }
        return new ArrayList<>(result);
    }

    private static String stripAccents(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFD);
        return normalized.replaceAll("\\p{M}", "");
    }

    /** Identifiant stable : slug alphanumerique minuscule ; genere un repli si vide. */
    private static String sanitizeId(String value, int index) {
        String base = value == null ? "" : stripAccents(value.trim()).toLowerCase(Locale.ROOT);
        StringBuilder slug = new StringBuilder();
        for (char c : base.toCharArray()) {
            if (Character.isLetterOrDigit(c)) {
                slug.append(c);
            } else if (slug.length() > 0 && slug.charAt(slug.length() - 1) != '-') {
                slug.append('-');
            }
        }
        String result = slug.toString().replaceAll("-+$", "");
        if (result.length() > 60) {
            result = result.substring(0, 60);
        }
        return result.isEmpty() ? "cat-" + (index + 1) : result;
    }

    /** Nettoie et borne la liste des categories recue. */
    private static List<TopUsersCategoryDto> sanitizeCategories(List<TopUsersCategoryDto> categories) {
        List<TopUsersCategoryDto> result = new ArrayList<>();
        Set<String> usedIds = new LinkedHashSet<>();
        int index = 0;
        for (TopUsersCategoryDto category : categories) {
            if (category == null || result.size() >= MAX_CATEGORIES) {
                continue;
            }
            String id = sanitizeId(category.id(), index);
            while (usedIds.contains(id)) {
                id = id + "-" + (index + 1);
            }
            usedIds.add(id);
            result.add(new TopUsersCategoryDto(
                    id,
                    sanitizeLabel(category.title()),
                    sanitizeLabel(category.actionLabel()),
                    normalizeEvents(category.events()),
                    normalizeLevels(category.levels()),
                    category.enabled()));
            index++;
        }
        return result.isEmpty() ? TopUsersConfigDto.defaultCategories() : result;
    }

    private String serializeCategories(List<TopUsersCategoryDto> categories) {
        List<TopUsersCategoryDto> sanitized = sanitizeCategories(categories);
        try {
            return objectMapper.writeValueAsString(sanitized);
        } catch (Exception e) {
            throw new IllegalStateException("Impossible de serialiser les categories du Top utilisateurs", e);
        }
    }

    private List<TopUsersCategoryDto> deserializeCategories(String json) {
        if (json == null || json.isBlank()) {
            return TopUsersConfigDto.defaultCategories();
        }
        try {
            List<TopUsersCategoryDto> parsed =
                    objectMapper.readValue(json, new TypeReference<List<TopUsersCategoryDto>>() {});
            List<TopUsersCategoryDto> sanitized = sanitizeCategories(parsed);
            return sanitized;
        } catch (Exception e) {
            return TopUsersConfigDto.defaultCategories();
        }
    }

    private TopUsersConfigDto toDto(TopUsersConfigEntity entity) {
        return new TopUsersConfigDto(
                Boolean.TRUE.equals(entity.getEnabled()),
                entity.getTopN() != null ? clampTopN(entity.getTopN()) : DEFAULT_TOP_N,
                Boolean.TRUE.equals(entity.getShowDelta()),
                deserializeCategories(entity.getCategoriesJson()));
    }
}
