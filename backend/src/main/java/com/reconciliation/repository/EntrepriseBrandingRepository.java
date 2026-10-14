package com.reconciliation.repository;

import com.reconciliation.entity.EntrepriseBrandingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Acces a la marque (theme, logo) par entreprise.
 *
 * <p>La cle est directement l'identifiant d'entreprise : {@code findById(id)}
 * renvoie la marque de l'entreprise {@code id}.</p>
 */
public interface EntrepriseBrandingRepository extends JpaRepository<EntrepriseBrandingEntity, Long> {
}
