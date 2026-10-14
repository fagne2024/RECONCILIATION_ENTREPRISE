package com.reconciliation.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Declare le module metier (catalogue {@code module.nom}) dont l'activation est
 * requise pour acceder a l'endpoint annote.
 *
 * <p>Un module doit etre <strong>actif pour l'entreprise</strong> de l'utilisateur
 * connecte (table {@code entreprise_module}) ; sinon l'acces est refuse par un
 * <strong>403 backend</strong> (jamais un simple masquage frontend). Si le module
 * n'est pas active mais qu'il s'agit d'un sous-menu, le module parent fait foi.</p>
 *
 * <p>Peut etre pose sur une <strong>classe</strong> (tous ses endpoints) ou une
 * <strong>methode</strong> (surcharge alors la classe). La valeur est le nom exact
 * du module tel qu'enregistre dans la table {@code module} (ex. {@code "Comptes"},
 * {@code "Réconciliation"}).</p>
 *
 * <p>La mise en oeuvre est assuree par {@code PermissionInterceptor} : en plus de
 * cette declaration explicite, l'intercepteur applique automatiquement le module
 * resolu depuis le chemin HTTP (defense en profondeur).</p>
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.METHOD})
public @interface RequiresModule {

    /** Nom du module (valeur de {@code module.nom}) requis pour l'acces. */
    String value();
}
