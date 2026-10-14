package com.reconciliation.tenant;

import com.reconciliation.entity.ServiceReferenceEntity;
import com.reconciliation.repository.ServiceReferenceRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Epreuve (etape 3) : verifie le filtrage effectif des entites annotees
 * {@code @TenantId} et, surtout, le comportement Hibernate lorsqu'AUCUN tenant
 * n'est defini (point decisif du "fail-closed").
 *
 * <p>Utilise le profil {@code test} (base MySQL locale dediee, schema cree par
 * Hibernate). Ne touche jamais la base applicative.</p>
 */
@SpringBootTest
@ActiveProfiles("test")
class TenantIsolationPilotTest {

    @Autowired
    private ServiceReferenceRepository repository;

    private ServiceReferenceEntity ref(String pays, String code) {
        ServiceReferenceEntity e = new ServiceReferenceEntity();
        e.setPays(pays);
        e.setCodeService(code);
        e.setServiceLabel("Service " + code);
        e.setCodeReco(code);
        e.setReconciliable(Boolean.TRUE);
        e.setStatus("ACTIF");
        return e;
    }

    @Test
    @DisplayName("Les lectures sont filtrees par entreprise et l'insertion renseigne le tenant")
    void isolationAndFailClosed() {
        TenantContext.runAs(1L, () -> repository.save(ref("CI", "SVC-ENT1")));
        TenantContext.runAs(2L, () -> repository.save(ref("SN", "SVC-ENT2")));

        List<Long> seenBy1 = TenantContext.callAs(1L,
                () -> repository.findAll().stream().map(ServiceReferenceEntity::getEntrepriseId).toList());
        List<Long> seenBy2 = TenantContext.callAs(2L,
                () -> repository.findAll().stream().map(ServiceReferenceEntity::getEntrepriseId).toList());

        System.out.println("[PILOT] entreprise 1 voit les entreprises: " + seenBy1);
        System.out.println("[PILOT] entreprise 2 voit les entreprises: " + seenBy2);

        assertThat(seenBy1).as("entreprise 1 ne doit voir que ses lignes").containsOnly(1L);
        assertThat(seenBy2).as("entreprise 2 ne doit voir que ses lignes").containsOnly(2L);

        // Aucun contexte : comportement fail-closed attendu (aucune ligne visible).
        TenantContext.clear();
        List<Long> noContext = repository.findAll().stream()
                .map(ServiceReferenceEntity::getEntrepriseId).toList();
        System.out.println("[PILOT] sans contexte, lignes visibles: " + noContext);
        assertThat(noContext)
                .as("sans tenant defini, aucune ligne metier ne doit etre visible")
                .isEmpty();
    }

    @Test
    @DisplayName("Le chargement par identifiant hors entreprise est refuse (anti-IDOR)")
    void findByIdIsBlockedAcrossTenants() {
        Long id = TenantContext.callAs(1L,
                () -> repository.save(ref("CI", "SVC-IDOR")).getId());

        // Meme entreprise : lecture autorisee
        assertThat(TenantContext.callAs(1L, () -> repository.findById(id))).isPresent();

        // Autre entreprise : le garde @PostLoad doit refuser le chargement
        org.assertj.core.api.Assertions.assertThatThrownBy(
                        () -> TenantContext.callAs(2L, () -> repository.findById(id)))
                .isInstanceOf(TenantAccessException.class);
    }
}
