---
name: code-review
description: >
  Effectue une revue de code complète et professionnelle pour des projets Spring Boot (Java/Kotlin)
  et/ou Angular (TypeScript). Utilise ce skill dès que l'utilisateur mentionne une revue de code,
  un PR review, une analyse de code, ou partage du code Spring Boot / Angular à analyser.
  Couvre : architecture, sécurité, performance, bonnes pratiques, lisibilité, tests.
  Trigger aussi pour : "analyse mon code", "qu'est-ce que tu penses de ce code", "est-ce que mon code est bon",
  "optimise mon code", "trouve les problèmes dans mon code", même sans mentionner explicitement "revue de code".
---

# Code Review — Spring Boot & Angular

## Processus de revue

1. **Identifier le contexte** : Spring Boot, Angular, ou les deux ?
2. **Lire le fichier de référence** correspondant au framework détecté
3. **Appliquer la checklist** section par section
4. **Produire le rapport** selon le format défini ci-dessous

---

## Fichiers de référence

- Pour Spring Boot → lire `references/springboot.md`
- Pour Angular → lire `references/angular.md`
- Pour les deux → lire les deux fichiers

---

## Format du rapport de revue

Structure le rapport ainsi :

```
## 🔍 Revue de code — [Nom du fichier / Composant]

### Résumé
[2-3 phrases sur l'état général du code]

### 🔴 Problèmes critiques
[Bugs, failles de sécurité, risques de crash — à corriger impérativement]

### 🟠 Améliorations importantes
[Mauvaises pratiques, performance, maintenabilité]

### 🟡 Suggestions mineures
[Style, lisibilité, conventions]

### ✅ Points positifs
[Ce qui est bien fait]

### 📋 Score global
Sécurité: X/10 | Performance: X/10 | Maintenabilité: X/10 | Tests: X/10
```

---

## Règles générales (tous frameworks)

- **Ne jamais logger de données sensibles** (mots de passe, tokens, PII)
- **Pas de secrets hardcodés** dans le code
- **Gestion des erreurs explicite** — pas de catch vides ou silencieux
- **Nommage clair et cohérent** (camelCase Java/TS, kebab-case Angular selectors)
- **Pas de code mort** (méthodes inutilisées, imports non utilisés)
- **Tests présents** pour la logique métier critique
