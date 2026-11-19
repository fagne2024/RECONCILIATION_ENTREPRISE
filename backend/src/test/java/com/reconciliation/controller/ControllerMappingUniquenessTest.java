package com.reconciliation.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Deux méthodes de controller sur le même verbe + chemin empêchent le démarrage de
 * l'application (« Ambiguous mapping »), erreur invisible à la compilation et aux tests
 * unitaires. Ex. : deux GET /api/traitement/lots/{lotId}/valeurs après une fusion.
 */
class ControllerMappingUniquenessTest {

    @Test
    void aucunVerbeEtCheminEnDouble() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));

        Map<String, String> vus = new HashMap<>();
        List<String> doublons = new ArrayList<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.reconciliation")) {
            Class<?> type = Class.forName(bd.getBeanClassName());
            RequestMapping racine = AnnotatedElementUtils.findMergedAnnotation(type, RequestMapping.class);
            String[] prefixes = racine == null || racine.path().length == 0 ? new String[]{""} : racine.path();
            for (Method m : type.getDeclaredMethods()) {
                RequestMapping rm = AnnotatedElementUtils.findMergedAnnotation(m, RequestMapping.class);
                if (rm == null) {
                    continue;
                }
                String[] chemins = rm.path().length == 0 ? new String[]{""} : rm.path();
                RequestMethod[] verbes = rm.method().length == 0 ? RequestMethod.values() : rm.method();
                for (String prefixe : prefixes) {
                    for (String chemin : chemins) {
                        for (RequestMethod verbe : verbes) {
                            String cle = verbe + " " + prefixe + chemin + " params=" + String.join(",", rm.params())
                                    + " headers=" + String.join(",", rm.headers());
                            String methode = type.getSimpleName() + "#" + m.getName();
                            String precedent = vus.putIfAbsent(cle, methode);
                            if (precedent != null && !precedent.equals(methode)) {
                                doublons.add(cle + " : " + precedent + " / " + methode);
                            }
                        }
                    }
                }
            }
        }
        assertThat(doublons).as("mappings en double").isEmpty();
    }
}
