# 19 — Règles de calcul : la configuration prime sur le code

> Module **Configuration &gt; Calcul** (`/configuration/calcul`).
> Date : 2026-10-21.

## 1. Principe

Toute règle de calcul enregistrée dans `calculation_rule` devient **prioritaire**
sur la formule codée en dur dans le moteur de calcul qui l'utilise.

```
règle configurée ET active  →  la règle s'applique
règle absente OU désactivée →  le code conserve sa valeur par défaut
```

Le repli n'est jamais « une autre règle » : c'est **la valeur codée dans le
moteur** (constante nommée `DEFAULT_*` côté backend, paramètre `fallback` de
chaque appel côté frontend). Une règle désactivée sur la page de configuration
=redonne donc exactement le comportement d'avant le branchement.

## 2. Branchements effectués

### Backend (`backend/src/main/java/com/reconciliation/service/CalculationRuleService.java`)

Nouvelles API :

| Méthode | Rôle |
|---|---|
| `getKeywordList(code, fallback)` | mots-clés d'une règle `LISTE`, normalisés (MAJUSCULES, sans accents) |
| `matchesAny(text, code, fallback)` | le texte contient-il l'un des mots-clés de la règle ? |

| Moteur | Règles |
|---|---|
| `OperationBancaireService` | `BANQUE.TYPES_APPROVISIONNEMENT` / `_COMPENSATION` / `_NIVELLEMENT` |
| `PredictionService` | `BANQUE.TYPES_*` |
| `SupplyPredictionService` | `BANQUE.TYPES_*` |
| `OperationService` (montant TSOP / transaction créée) | `CERTIF.SERVICES_TSOP_NEGATIFS` |
| `EcartSoldeService` (normalisation du montant par service) | `CERTIF.SERVICES_TSOP_NEGATIFS` |
| `FileWatcherController` (détection par nom de fichier) | `MODELES.TOKENS_OPPART` |
| `ConfigurableReconciliationService` (nom du fichier modèle) | `MODELES.TOKENS_OPPART` |
| `RedevanceService` (existant) | `REDEVANCE.*` |

### Frontend (`frontend/src/app/services/configuration-calcul.service.ts`)

- `getActiveRule(code)` ne lit plus que les règles **chargées depuis l'API** :
  le miroir local `DEFAULT_RULES` n'est plus utilisé pour les calculs (il ne
  reste qu'une référence d'affichage).
- `evaluate()` / `getNumber()` / `getList()` / `getListRaw()` : règle active →
  valeur ; sinon → repli fourni par le code.
- Nouveau `matchesAny(text, code, fallback)` (équivalent frontend du backend).
- Chargement global via `APP_INITIALIZER` (`app.module.ts`) : les règles sont
  disponibles sur **toutes** les pages, y compris celles qui n'appelaient pas
  `loadRules()` (ex. `ecart-solde.service.ts`, qui appliquait donc la valeur
  par défaut au lieu de la valeur configurée).

### Sites frontendifiés sur les règles

| Fichier | Règles |
|---|---|
| `certification-solde.service.ts` | `CERTIF.*` (déjà branché) |
| `certification-solde.component.ts` / `.html` | `CERTIF.ECART_FRAIS` (écran + export Excel) |
| `comptes.component.ts` / `.html` | `COMPTES.SEUIL_CRITICITE_*` (couleur des cartes + export) |
| `ecart-solde.service.ts` | `ECARTSOLDE.FRAIS_SIGNE` |
| `banque.component.ts` | `BANQUE.TYPES_*` (déjà branché) |
| `column-selection.component.ts` | `COLUMNSELECTION.SEUIL_CONFIANCE` (déjà branché) |
| `auto-processing-models.component.ts` | `MODELES.TOKENS_*` (déjà branché) |
| `ecart-partenaire`, `ecart-partner-table`, `reconciliation-results`, `impact-op` | `BANQUE.TYPES_*` (classification par mots-clés) |

## 3. Correction de cohérence

- `CERTIF.ECART_FRAIS` : le repli du composant utilisait `|facturé| − |attendu|`
  alors que la règle (et l'écran, l'export Excel) utilisent `|attendu| − |facturé|`.
  Le repli du code a été aligné sur la règle : l'affichage ne dépend plus de
  l'activation de la règle.
- `CERTIF.SERVICES_TSOP_NEGATIFS` : le seed initial listait `CASHIN, AIRTIME`
  alors que le code appliquait `cashin, send, airtime`. La règle par défaut a
  été réalignée (migration `V13__align_calculation_rule_tsop_services.sql`,
  qui ne touche que les valeurs restées à l'ancien défaut).

## 4. Multi-entreprise

`CalculationRuleService.copyDefaultsTo(entrepriseId)` est appelé à la création
d'une entreprise (`PlatformEntrepriseService.create`) : sans cela, la page
Configuration &gt; Calcul serait vide pour le nouveau tenant et tous les calculs
retomberaient sur les valeurs par défaut.

## 5. Volontairement NON branché

| Cas | Raison |
|---|---|
| `KeyDiscoveryService` (scores de similarité 0.70 / 0.80) | ce sont des **scores**, pas le seuil d'application automatique d'une suggestion (`COLUMNSELECTION.SEUIL_CONFIANCE`) |
| Détection TRXBO / USSDPART par **contenu de colonne** | la règle porte sur le **nom de fichier** (`MODELES.TOKENS_*`) |
| Correspondances exactes `Appro_client` / `Compense_client` / `nivellement` | ce sont des types métier, pas une classification par mots-clés |
| Regroupement « total_cashin » (AgencySummary, ReconciliationController) | autre objectif (ventilation d'activité), pas la convention de signe TSOP |

## 6. Tests

`backend/src/test/java/com/reconciliation/service/CculationRuleServicePrioriteTest.java`
couvre : règle active prioritaire, règle absente, règle désactivée, comparaison
insensible à la casse et aux accents, normalisation des mots-clés.
