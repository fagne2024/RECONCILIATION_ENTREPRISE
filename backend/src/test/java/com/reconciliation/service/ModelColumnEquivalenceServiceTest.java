package com.reconciliation.service;

import com.reconciliation.entity.ModelColumnEquivalenceEntity;
import com.reconciliation.repository.AutoProcessingModelRepository;
import com.reconciliation.repository.ModelColumnEquivalenceRepository;
import com.reconciliation.service.ModelColumnEquivalenceService.ColumnEquivalence;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

/**
 * Configuration &gt; Normalisation modèle : contrôle de la saisie des en-têtes équivalents.
 */
class ModelColumnEquivalenceServiceTest {

    private ModelColumnEquivalenceRepository repository;
    private AutoProcessingModelRepository modelRepository;
    private ModelColumnEquivalenceService service;

    @BeforeEach
    void setUp() {
        repository = mock(ModelColumnEquivalenceRepository.class);
        modelRepository = mock(AutoProcessingModelRepository.class);
        service = new ModelColumnEquivalenceService();
        ReflectionTestUtils.setField(service, "repository", repository);
        ReflectionTestUtils.setField(service, "modelRepository", modelRepository);
    }

    @Test
    @DisplayName("nettoie les libellés, supprime doublons et auto-références, ignore les colonnes sans équivalent")
    void validateCleansInput() {
        Map<String, ColumnEquivalence> result = service.validate(List.of(
                new ColumnEquivalence(" Numéro Trans GU ", List.of("Num Trans GU", "num trans gu", " ID ", "Numero Trans GU", "")),
                new ColumnEquivalence("montant", List.of("Amount")),
                new ColumnEquivalence("Agence", List.of())
        ));
        assertEquals(2, result.size());
        ColumnEquivalence gu = result.get(ModelColumnEquivalenceService.normalize("Numéro Trans GU"));
        assertEquals("Numéro Trans GU", gu.columnName());
        assertEquals(List.of("Num Trans GU", "ID"), gu.equivalents());
        assertFalse(result.containsKey("agence"));
    }

    @Test
    @DisplayName("refuse un en-tête équivalent de deux colonnes")
    void rejectsEquivalentOwnedTwice() {
        assertThrows(ResponseStatusException.class, () -> service.validate(List.of(
                new ColumnEquivalence("Agence", List.of("Client")),
                new ColumnEquivalence("Agent", List.of("client"))
        )));
    }

    @Test
    @DisplayName("refuse qu'une colonne par défaut serve d'équivalent à une autre")
    void rejectsDefaultColumnAsEquivalent() {
        assertThrows(ResponseStatusException.class, () -> service.validate(List.of(
                new ColumnEquivalence("Agence", List.of("Agent")),
                new ColumnEquivalence("Agent", List.of("Agent Name"))
        )));
    }

    @Test
    @DisplayName("met à jour, crée et supprime sans réinsérer les lignes existantes")
    void replaceForModelUpserts() {
        when(modelRepository.existsByModelId("airtel")).thenReturn(true);
        ModelColumnEquivalenceEntity kept = entity("airtel", "Montant", List.of("Amount"));
        ModelColumnEquivalenceEntity removed = entity("airtel", "Agence", List.of("Agency"));
        when(repository.findByModelIdOrderByColumnNameAsc("airtel"))
                .thenReturn(new ArrayList<>(List.of(kept, removed)));

        service.replaceForModel("airtel", List.of(
                new ColumnEquivalence("montant", List.of("Amount", "Transaction Amount")),
                new ColumnEquivalence("Numéro Trans GU", List.of("Num Trans GU"))
        ));

        verify(repository).deleteAll(List.of(removed));
        verify(repository).saveAll(anyList());
        assertEquals(List.of("Amount", "Transaction Amount"), kept.getEquivalents());
    }

    @Test
    @DisplayName("modèle inconnu : 404")
    void unknownModel() {
        when(modelRepository.existsByModelId("inconnu")).thenReturn(false);
        assertThrows(ResponseStatusException.class,
                () -> service.replaceForModel("inconnu", List.of()));
        verify(repository, never()).saveAll(anyList());
    }

    private static ModelColumnEquivalenceEntity entity(String modelId, String column, List<String> equivalents) {
        ModelColumnEquivalenceEntity e = new ModelColumnEquivalenceEntity();
        e.setModelId(modelId);
        e.setColumnName(column);
        e.setEquivalents(new ArrayList<>(equivalents));
        return e;
    }
}
