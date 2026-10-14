package com.reconciliation.config;

import com.reconciliation.tenant.TenantIdentifierResolver;
import org.hibernate.cfg.MultiTenancySettings;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Branchement du multi-tenant Hibernate (mode DISCRIMINATOR : base et schema
 * partages, colonne {@code entreprise_id}).
 *
 * <p>Active {@code hibernate.multiTenancy=discriminator} et enregistre le
 * {@link TenantIdentifierResolver} alimente par {@code TenantContext}. A partir
 * de la, toute entite annotee {@code @TenantId} est automatiquement filtree sur
 * l'entreprise courante (lectures) et renseignee a l'insertion.</p>
 */
@Configuration
public class TenantHibernateConfig {

    @Bean
    public CurrentTenantIdentifierResolver<Long> currentTenantIdentifierResolver() {
        return new TenantIdentifierResolver();
    }

    @Bean
    public HibernatePropertiesCustomizer tenantHibernatePropertiesCustomizer(
            CurrentTenantIdentifierResolver<Long> currentTenantIdentifierResolver) {
        return hibernateProperties -> {
            // Hibernate 6.5 : la strategie est deduite de la presence du resolveur ;
            // il suffit de l'enregistrer. Les entites @TenantId sont alors filtrees
            // sur l'entreprise courante (lectures) et renseignees a l'insertion.
            hibernateProperties.put(MultiTenancySettings.MULTI_TENANT_IDENTIFIER_RESOLVER,
                    currentTenantIdentifierResolver);
        };
    }
}
