package com.reconciliation.dto;

import java.util.List;

/**
 * Corps de requete de mise a jour des modules actifs d'une entreprise.
 *
 * <p>{@code activeModuleIds} remplace l'ensemble des modules actifs de
 * l'entreprise : tout module (du catalogue) absent de la liste est desactive.
 * Une liste vide (ou nulle) desactive tous les modules.</p>
 */
public class UpdateEntrepriseModulesRequest {

    private List<Long> activeModuleIds;

    public List<Long> getActiveModuleIds() {
        return activeModuleIds;
    }

    public void setActiveModuleIds(List<Long> activeModuleIds) {
        this.activeModuleIds = activeModuleIds;
    }
}
