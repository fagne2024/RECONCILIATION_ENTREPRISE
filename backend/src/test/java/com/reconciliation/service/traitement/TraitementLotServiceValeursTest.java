package com.reconciliation.service.traitement;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La valeur proposée dans la section de filtres doit être exactement celle que le filtre
 * serveur compare ({@link TraitementTransformations#appartient}), sinon une valeur cochée
 * ne retiendrait aucune ligne.
 */
class TraitementLotServiceValeursTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final TraitementLotService service = new TraitementLotService(null, mapper, null);

    @Test
    void valeurIdentiqueAuFiltrePourChaqueType() throws Exception {
        Map<String, Object> ligne = new LinkedHashMap<>();
        ligne.put("Texte", "OK");
        ligne.put("Entier", 42);
        ligne.put("Decimal", 1500.0);
        ligne.put("Grand", 1.0E10);
        ligne.put("Vide", "");
        ligne.put("Nul", null);
        ligne.put("Objet", Map.of("a", 1));
        ligne.put("Liste", List.of(1, 2));
        ligne.put("Fin", "après objet");
        String json = mapper.writeValueAsString(ligne);
        Map<?, ?> relue = mapper.readValue(json, LinkedHashMap.class);

        for (String col : List.of("Texte", "Entier", "Decimal", "Grand", "Vide", "Nul", "Fin")) {
            String attendu = relue.get(col) == null ? "" : String.valueOf(relue.get(col));
            assertThat(service.valeurColonne(json, col)).as(col).isEqualTo(attendu);
            assertThat(TraitementTransformations.appartient(relue.get(col), List.of(service.valeurColonne(json, col))))
                    .as("filtre " + col).isTrue();
        }
    }

    @Test
    void colonneAbsenteRenvoieVide() {
        assertThat(service.valeurColonne("{\"A\":\"1\"}", "B")).isEmpty();
    }
}
