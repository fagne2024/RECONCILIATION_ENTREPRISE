package com.reconciliation.service;

import com.reconciliation.entity.SuiviTrxAnnulerEntity;
import com.reconciliation.model.SuiviTrxAnnuler;
import com.reconciliation.repository.SuiviTrxAnnulerRepository;
import com.reconciliation.util.RequestContextUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Persistance du suivi des transactions a annuler.
 *
 * <p>Le statut n'est jamais fourni par le client : il est deduit de la presence
 * de l'ID Annulation (OK) ou de son absence (En cours).</p>
 */
@Service
public class SuiviTrxAnnulerService {

    public static final String STATUT_OK = "OK";
    public static final String STATUT_EN_COURS = "En cours";

    private final SuiviTrxAnnulerRepository repository;

    public SuiviTrxAnnulerService(SuiviTrxAnnulerRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<SuiviTrxAnnuler> getAll() {
        return repository.findAllByOrderByCreatedAtDescIdDesc().stream()
                .map(this::convertToModel)
                .toList();
    }

    @Transactional(readOnly = true)
    public Optional<SuiviTrxAnnuler> getById(Long id) {
        if (id == null) {
            return Optional.empty();
        }
        return repository.findById(id).map(this::convertToModel);
    }

    /**
     * Cree la ligne, ou met a jour la ligne existante (meme id, sinon meme
     * matchKey pour l'entreprise courante). Idempotent : un nouvel envoi depuis
     * /matches ne cree pas de doublon.
     */
    @Transactional
    public SuiviTrxAnnuler save(SuiviTrxAnnuler dto) {
        if (dto == null) {
            throw new IllegalArgumentException("Les donnees du suivi sont obligatoires.");
        }
        SuiviTrxAnnulerEntity entity = resolveExisting(dto).orElseGet(SuiviTrxAnnulerEntity::new);
        boolean isNew = entity.getId() == null;

        applyFields(entity, dto);

        String username = RequestContextUtil.getUsernameFromRequest();
        if (username != null && !username.isBlank()) {
            if (isNew) {
                entity.setCreatedBy(username);
            }
            entity.setUpdatedBy(username);
        }

        return convertToModel(repository.save(entity));
    }

    @Transactional
    public SuiviTrxAnnuler update(Long id, SuiviTrxAnnuler dto) {
        if (id == null) {
            throw new IllegalArgumentException("L'identifiant est obligatoire.");
        }
        SuiviTrxAnnulerEntity entity = repository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Suivi introuvable: " + id));

        applyFields(entity, dto);

        String username = RequestContextUtil.getUsernameFromRequest();
        if (username != null && !username.isBlank()) {
            entity.setUpdatedBy(username);
        }

        return convertToModel(repository.save(entity));
    }

    @Transactional
    public void delete(Long id) {
        if (id != null) {
            repository.deleteById(id);
        }
    }

    private Optional<SuiviTrxAnnulerEntity> resolveExisting(SuiviTrxAnnuler dto) {
        if (dto.getId() != null) {
            Optional<SuiviTrxAnnulerEntity> byId = repository.findById(dto.getId());
            if (byId.isPresent()) {
                return byId;
            }
        }
        String matchKey = trim(dto.getMatchKey());
        if (matchKey != null) {
            return repository.findFirstByMatchKeyOrderByIdAsc(matchKey);
        }
        return Optional.empty();
    }

    private void applyFields(SuiviTrxAnnulerEntity entity, SuiviTrxAnnuler dto) {
        entity.setMatchKey(trim(dto.getMatchKey()));
        entity.setBoDate(trim(dto.getBoDate()));
        entity.setBoAgence(trim(dto.getBoAgence()));
        entity.setBoService(trim(dto.getBoService()));
        entity.setBoMontant(trim(dto.getBoMontant()));
        entity.setBoToken(trim(dto.getBoToken()));
        entity.setBoPays(trim(dto.getBoPays()));
        entity.setBoEnv(trim(dto.getBoEnv()));
        entity.setBoTelephone(trim(dto.getBoTelephone()));

        // Le statut BO est saisi uniquement depuis la page de suivi. Les autres
        // ecrans (matches, ecart-partner) peuvent renvoyer une ligne existante
        // sans ce champ : dans ce cas on conserve la valeur deja enregistree.
        String boStatut = trim(dto.getBoStatut());
        if (boStatut != null || entity.getId() == null) {
            entity.setBoStatut(boStatut);
        }

        // Meme regle pour le statut partenaire : les autres ecrans peuvent
        // renvoyer la ligne sans ce champ, on conserve alors la valeur saisie.
        String statutPart = trim(dto.getStatutPart());
        if (statutPart != null || entity.getId() == null) {
            entity.setStatutPart(statutPart);
        }

        entity.setPartnerTransactionId(trim(dto.getPartnerTransactionId()));
        entity.setPartnerDate(trim(dto.getPartnerDate()));
        entity.setPartnerMontant(trim(dto.getPartnerMontant()));
        entity.setPartnerTelephone(trim(dto.getPartnerTelephone()));

        // Un nouvel envoi depuis /matches peut ne pas connaitre l'ID Annulation
        // deja saisi sur la page : on ne remplace alors pas la valeur existante.
        String idAnnulation = trim(dto.getIdAnnulation());
        if (idAnnulation != null || entity.getId() == null) {
            entity.setIdAnnulation(idAnnulation);
        }

        String current = entity.getIdAnnulation();
        entity.setStatut(current != null && !current.isBlank() ? STATUT_OK : STATUT_EN_COURS);
    }

    private SuiviTrxAnnuler convertToModel(SuiviTrxAnnulerEntity entity) {
        SuiviTrxAnnuler model = new SuiviTrxAnnuler();
        model.setId(entity.getId());
        model.setMatchKey(entity.getMatchKey());
        model.setBoDate(entity.getBoDate());
        model.setBoAgence(entity.getBoAgence());
        model.setBoService(entity.getBoService());
        model.setBoMontant(entity.getBoMontant());
        model.setBoToken(entity.getBoToken());
        model.setBoPays(entity.getBoPays());
        model.setBoEnv(entity.getBoEnv());
        model.setBoTelephone(entity.getBoTelephone());
        model.setBoStatut(entity.getBoStatut());
        model.setPartnerTransactionId(entity.getPartnerTransactionId());
        model.setPartnerDate(entity.getPartnerDate());
        model.setPartnerMontant(entity.getPartnerMontant());
        model.setIdAnnulation(entity.getIdAnnulation());
        model.setPartnerTelephone(entity.getPartnerTelephone());
        model.setStatut(entity.getStatut());
        model.setStatutPart(entity.getStatutPart());
        model.setCreatedBy(entity.getCreatedBy());
        model.setUpdatedBy(entity.getUpdatedBy());
        model.setCreatedAt(entity.getCreatedAt());
        model.setUpdatedAt(entity.getUpdatedAt());
        return model;
    }

    private String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
