package com.reconciliation.tenant;

import jakarta.persistence.PostLoad;
import org.hibernate.Hibernate;

import java.lang.reflect.Field;

/**
 * Garde d'isolation applique a chaque entite {@code @TenantId} via
 * {@code @EntityListeners}.
 *
 * <p>A chaque chargement ({@link PostLoad}), verifie que l'entreprise de
 * l'entite correspond au contexte courant. Indispensable car Hibernate ne
 * filtre pas le chargement direct par identifiant : sans ce garde, un
 * utilisateur pourrait lire les donnees d'une autre entreprise en devinant un
 * identifiant.</p>
 */
public class TenantGuardEntityListener {

    @PostLoad
    public void checkTenant(Object entity) {
        Long entityEntrepriseId = readEntrepriseId(entity);
        if (entityEntrepriseId == null) {
            return;
        }
        Long current = TenantContext.get();
        if (current == null) {
            throw new TenantAccessException(
                "Acces refuse : aucun contexte entreprise.");
        }
        if (!entityEntrepriseId.equals(current)) {
            throw new TenantAccessException(
                "Acces refuse : ressource appartenant a une autre entreprise.");
        }
    }

    private Long readEntrepriseId(Object entity) {
        if (entity == null) {
            return null;
        }
        Class<?> clazz = Hibernate.getClass(entity);
        while (clazz != null && clazz != Object.class) {
            try {
                Field field = clazz.getDeclaredField("entrepriseId");
                field.setAccessible(true);
                Object value = field.get(entity);
                return value == null ? null : ((Number) value).longValue();
            } catch (NoSuchFieldException e) {
                clazz = clazz.getSuperclass();
            } catch (IllegalAccessException e) {
                return null;
            }
        }
        return null;
    }
}
