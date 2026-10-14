package com.reconciliation.tenant;

/**
 * Levee lorsqu'une entite appartenant a une autre entreprise que celle du
 * contexte courant est chargee (protection contre l'acces par identifiant).
 *
 * <p>Hibernate filtre les requetes des entites {@code @TenantId}, mais pas le
 * chargement direct par cle primaire ({@code EntityManager.find}). Ce garde
 * comble cette breche.</p>
 */
public class TenantAccessException extends RuntimeException {

    public TenantAccessException(String message) {
        super(message);
    }
}
