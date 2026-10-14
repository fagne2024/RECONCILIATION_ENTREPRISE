package com.reconciliation.util;

import com.reconciliation.entity.PaysEntity;
import com.reconciliation.repository.PaysRepository;
import com.reconciliation.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;

@Component
public class PaysInitializer implements CommandLineRunner {

    @Autowired
    private PaysRepository paysRepository;

    @Override
    public void run(String... args) throws Exception {
        // Initialisation technique : rattachee a l'entreprise historique.
        TenantContext.runAs(TenantContext.HISTORIQUE_ENTREPRISE_ID, this::initializePays);
    }

    private void initializePays() {
        try {
            System.out.println("🔄 Initialisation des pays...");
            
            List<PaysEntity> paysToCreate = Arrays.asList(
                new PaysEntity("GNL", "GNL - Tous les pays"),
                new PaysEntity("CM", "Cameroun"),
                new PaysEntity("SN", "Sénégal"),
                new PaysEntity("CI", "Côte d'Ivoire"),
                new PaysEntity("BF", "Burkina Faso"),
                new PaysEntity("ML", "Mali"),
                new PaysEntity("BJ", "Bénin"),
                new PaysEntity("NE", "Niger"),
                new PaysEntity("TD", "Tchad"),
                new PaysEntity("TG", "Togo")
            );

            int createdCount = 0;
            for (PaysEntity pays : paysToCreate) {
                if (!paysRepository.findByCode(pays.getCode()).isPresent()) {
                    paysRepository.save(pays);
                    createdCount++;
                    System.out.println("✅ Pays créé: " + pays.getCode() + " - " + pays.getNom());
                } else {
                    System.out.println("ℹ️  Pays déjà existant: " + pays.getCode() + " - " + pays.getNom());
                }
            }

            if (createdCount > 0) {
                System.out.println("✅ " + createdCount + " pays initialisés avec succès!");
            } else {
                System.out.println("ℹ️  Tous les pays sont déjà initialisés.");
            }
            
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'initialisation des pays: " + e.getMessage());
            e.printStackTrace();
        }
    }
}

