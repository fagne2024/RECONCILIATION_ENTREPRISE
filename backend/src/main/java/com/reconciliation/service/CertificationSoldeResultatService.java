package com.reconciliation.service;

import com.reconciliation.dto.CertificationSoldeResultatSummary;
import com.reconciliation.entity.CertificationSoldeResultatEntity;
import com.reconciliation.repository.CertificationSoldeResultatRepository;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Optional;

@Service
public class CertificationSoldeResultatService {

    private static final int MAX_PAGE_SIZE = 100;

    @Autowired
    private CertificationSoldeResultatRepository repository;

    /**
     * Enregistre le résultat d'une certification. Une certification existante pour le même
     * compte et la même période (du / au) est remplacée.
     */
    @Transactional
    public CertificationSoldeResultatEntity saveOrUpdate(CertificationSoldeResultatEntity payload) {
        String numeroCompte = payload.getNumeroCompte() == null ? "" : payload.getNumeroCompte().trim();
        if (numeroCompte.isEmpty()) {
            throw new IllegalArgumentException("Le numéro de compte est obligatoire.");
        }
        if (payload.getDateDebut() == null || payload.getDateFin() == null) {
            throw new IllegalArgumentException("La période (du / au) est obligatoire.");
        }
        if (payload.getDateDebut().isAfter(payload.getDateFin())) {
            throw new IllegalArgumentException("La date de début doit précéder la date de fin.");
        }

        String username = RequestContextUtil.getUsernameFromRequest();
        CertificationSoldeResultatEntity entity = repository
                .findByNumeroCompteAndDateDebutAndDateFin(numeroCompte, payload.getDateDebut(), payload.getDateFin())
                .orElseGet(() -> {
                    CertificationSoldeResultatEntity created = new CertificationSoldeResultatEntity();
                    created.setCreatedBy(username);
                    return created;
                });

        entity.setNumeroCompte(numeroCompte);
        entity.setDateDebut(payload.getDateDebut());
        entity.setDateFin(payload.getDateFin());
        entity.setEnv(normalizeCode(payload.getEnv()));
        entity.setPays(normalizeCode(payload.getPays()));
        entity.setHeureOuverture(payload.getHeureOuverture());
        entity.setHeureCloture(payload.getHeureCloture());
        entity.setTitre(payload.getTitre());
        entity.setSoldeOuverture(payload.getSoldeOuverture());
        entity.setSoldeCloture(payload.getSoldeCloture());
        entity.setTotalDebit(payload.getTotalDebit());
        entity.setTotalCredit(payload.getTotalCredit());
        entity.setVariation(payload.getVariation());
        entity.setMouvementNetOppart(payload.getMouvementNetOppart());
        entity.setFraisAttendu(payload.getFraisAttendu());
        entity.setFraisFactures(payload.getFraisFactures());
        entity.setEcartFrais(payload.getEcartFrais());
        entity.setEcartMouvement(payload.getEcartMouvement());
        entity.setTotalRegularisation(payload.getTotalRegularisation());
        entity.setEcartCertification(payload.getEcartCertification());
        entity.setSoldeClotureTheorique(payload.getSoldeClotureTheorique());
        entity.setVolumeEcartBo(payload.getVolumeEcartBo());
        entity.setVolumeEcartPartenaire(payload.getVolumeEcartPartenaire());
        entity.setNbLignesBo(payload.getNbLignesBo());
        entity.setNbLignesPartenaire(payload.getNbLignesPartenaire());
        entity.setNbCorrespondances(payload.getNbCorrespondances());
        entity.setCommentaire(payload.getCommentaire());
        entity.setDetailsJson(payload.getDetailsJson());
        entity.setUpdatedBy(username);
        return repository.save(entity);
    }

    @Transactional(readOnly = true)
    public Page<CertificationSoldeResultatSummary> list(String numeroCompte, String env, String pays,
                                                        LocalDate dateDebut, LocalDate dateFin,
                                                        int page, int size) {
        String compte = numeroCompte == null || numeroCompte.isBlank() ? null : numeroCompte.trim();
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        return repository.search(compte, normalizeCode(env), normalizeCode(pays), dateDebut, dateFin,
                        PageRequest.of(Math.max(page, 0), safeSize))
                .map(CertificationSoldeResultatSummary::of);
    }

    private static String normalizeCode(String value) {
        return value == null || value.isBlank() ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    @Transactional(readOnly = true)
    public Optional<CertificationSoldeResultatEntity> get(Long id) {
        return repository.findById(id);
    }

    @Transactional
    public boolean delete(Long id) {
        return repository.findById(id)
                .map(entity -> {
                    repository.delete(entity);
                    return true;
                })
                .orElse(false);
    }

    /**
     * Met à jour le pays d'une certification enregistrée. Un pays vide ou nul
     * retire l'affectation. Retourne l'entité mise à jour, ou vide si introuvable.
     */
    @Transactional
    public Optional<CertificationSoldeResultatEntity> updatePays(Long id, String pays) {
        return repository.findById(id)
                .map(entity -> {
                    entity.setPays(normalizeCode(pays));
                    entity.setUpdatedBy(RequestContextUtil.getUsernameFromRequest());
                    return repository.save(entity);
                });
    }
}
