package com.reconciliation.config;

import org.apache.coyote.http11.AbstractHttp11Protocol;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Configuration spécifique Tomcat.
 * - Gestion plus gracieuse des erreurs de parsing HTTP
 * - Suppression de l'en-tête X-Powered-By ajouté par Tomcat
 */
@Configuration
public class TomcatErrorHandler {

    private static final Logger log = LoggerFactory.getLogger(TomcatErrorHandler.class);

    @Bean
    public WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatCustomizer() {
        return factory -> factory.addConnectorCustomizers(connector -> {
            // Timeout de connexion pour fermer rapidement les connexions malformées
            connector.setProperty("connectionTimeout", "20000");

            // Désactiver explicitement l'en-tête X-Powered-By au niveau du connecteur Tomcat
            connector.setXpoweredBy(false);

            if (connector.getProtocolHandler() instanceof AbstractHttp11Protocol<?>) {
                log.debug("Configuration du protocole HTTP Tomcat détectée, X-Powered-By désactivé via le connecteur");
            }

            log.debug("Configuration Tomcat appliquée");
        });
    }
}

