package com.reconciliation.tenant;

import org.hibernate.context.spi.CurrentTenantIdentifierResolver;

/**
 * Fournit a Hibernate l'identifiant d'entreprise du thread courant.
 *
 * <p>Hibernate applique ce tenant aux entites annotees
 * {@code org.hibernate.annotations.TenantId} : filtrage automatique des
 * lectures et renseignement automatique de la colonne a l'insertion.</p>
 *
 * <p>Ce resolveur lit {@link TenantContext} : si aucune entreprise n'est
 * definie, il renvoie le sentinel {@link TenantContext#NO_TENANT} (jamais
 * {@code null}, interdit par Hibernate) afin que toute lecture soit vide et
 * toute ecriture rejetee (fail-closed). Le refus cote HTTP est en plus gere par
 * le filtre et le {@code PermissionInterceptor}.</p>
 */
public class TenantIdentifierResolver implements CurrentTenantIdentifierResolver<Long> {

    @Override
    public Long resolveCurrentTenantIdentifier() {
        Long current = TenantContext.get();
        return current != null ? current : TenantContext.NO_TENANT;
    }

    /**
     * Les sessions existantes ne sont pas revalidees : le tenant peut changer
     * legitimement dans une meme session technique (ex. tache multi-entreprise).
     */
    @Override
    public boolean validateExistingCurrentSessions() {
        return false;
    }
}
