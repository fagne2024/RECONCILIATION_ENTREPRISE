# Guide d'utilisation - Modules Réconciliation et Résultats

Ce guide décrit le fonctionnement des modules **Réconciliation** et **Résultats** dans ReconciliApp, tels qu'ils sont implémentés dans l'application.

## 1. Accès et périmètre

- **Menu Réconciliation** (module métier `Réconciliation`) : Lanceur, Mode Manuel, Mode assisté, Certification de solde.
- **Menu Résultats** (module métier `Résultats`) : Vue d'ensemble, État des réconciliations, Correspondances, Écarts BO, Écarts Partenaire, Suivi des écarts J-1 & J+1, Rapport réconciliation, Rapport BO vs Partenaire, Contrôle interne BO vs Partenaire.
- L'accès aux écrans est protégé par `AuthGuard` et `ModuleAccessGuard` (droit « Consulter » sur le module correspondant). 

---

## 2. Module Réconciliation

### 2.1 Lanceur (`/reconciliation-launcher`)

Le lanceur permet de choisir le mode de réconciliation. Trois modes sont proposés :

| Mode | Automatisation | Public visé | Principe |
| :-- | :--------------- | :------------ | :-------- |
| **Manuel** | Faible | Utilisateurs souhaitant un contrôle total sur les colonnes clés et le paramétrage. | Sélection explicite des colonnes clés BO/Partenaire, configuration manuelle. |
| **Assisté** | Moyen | Utilisateurs voulant un accompagnement avec des suggestions de règles. | Propose des règles (Standard/Ratio/Personnalisée), tolérance, sélection d'agences/services/statuts, suggestions. |
| **Magique** | Élevée | Utilisateurs voulant une détection automatique la plus rapide. | Détection automatique des clés à partir des fichiers. Un fichier BO + un ou plusieurs fichiers partenaire (CSV/XLSX/XLS). |

Depuis le pied de page du lanceur :
- **Réinitialiser les données** : disponible s'il y a des données à réinitialiser.
- **Continuer** : active uniquement après sélection d'un mode.

#### Mode Magique (popup)
Le mode magique ouvre une fenêtre modale permettant de déposer :
- Un fichier **BO** (obligatoire)
- Un ou plusieurs fichiers **Partenaire** (obligatoires)

Fonctionnement :
1. Déposer/choisir les fichiers (glisser-déposer ou sélection).
2. Lancement de la détection automatique des colonnes clés.
3. Si la confiance est < 70 %, l'application invite à utiliser le **Mode Assisté** (`LNC.autoDetectionFailed`).
4. À l'issue, navigation vers la page **Résultats** (`/results`).

### 2.2 Mode Manuel (`/upload`)

Déroulement typique :
1. **Depuis le lanceur** : sélection du mode « Manuel » → redirection vers `/column-selection?mode=manual` (si les fichiers ne sont pas déjà chargés).
2. **Sélection des colonnes clés** (`/column-selection`) :
   - Sélection des colonnes clés BO et Partenaire (avec suggestions automatiques).
   - Possibilité d'ajouter des **clés supplémentaires**.
   - Configuration du **seuil de confiance** (si applicable au parcours).
3. **Upload des fichiers** (`/upload`) : chargement des fichiers BO et Partenaire pour exécution de la réconciliation.
4. Lancement du traitement, suivi de progression, puis redirection vers les **Résultats**.

### 2.3 Mode Assisté (`/upload-assisted`)

Déroulement typique :
1. Sélection du mode « Assisté » depuis le lanceur → redirection vers `/upload-assisted`.
2. Chargement des fichiers BO et Partenaire.
3. Paramétrage assisté :
   - Type de rapprochement : **Standard** / **Ratio** / **Personnalisée**
   - **Ratio** et **tolérance** (si ratio/personnalisée)
   - Sélection **Agences / Services / Statuts** (filtrage des éléments à rapprocher)
4. Lancement du traitement. Le composant gère le traitement de fichiers et la navigation vers les résultats.

### 2.4 Certification de solde

Entrée « Certification de solde » dans le menu Réconciliation (route `/certification-solde`), avec des préfixes API liés à `compte-solde-bo` / `compte-solde-cloture`. Ce parcours est dédié à la certification des soldes dans le cadre de la réconciliation.

---

## 3. Module Résultats

### 3.1 Vue d'ensemble (`/results`)

Page synthétique présentant les résultats de la réconciliation exécutée.

Éléments principaux :
- **KPIs globaux** : totaux BO/Partenaire, correspondances, écarts BO, écarts Partenaire, incohérences.
- **Résultats magiques** : répartition par service/fichier partenaire (le cas échéant).
- **Rapport groupé** / **Résumé par Agence** (onglet « Résumé par Agence »).
- **Liens rapides** vers : *Correspondances*, *Écarts BO*, *Écarts Partenaire*.
- **Accès** aux rapports : *Rapport des écarts*, *Rapport réconciliation*.
- **Action** : « Nouvelle réconciliation » pour relancer un parcours depuis le lanceur.

**Règle métier importante (rapport)** :
- Une ligne est considérée **verrouillée** si `status === 'OK' && traitement === 'Terminé'`.
- **Nombre de correspondances** = `Total transactions` − (`Écarts BO` + `Incohérences`).

### 3.2 État des réconciliations (`/etat-reconciliations`)

Suivi de l'état de rapprochement par service/période avec indicateurs d'alerte.

Fonctionnalités :
- **Périodes** : Jour, 7 jours, 30 jours, Semaine, Semaine passée, Mois, Trimestre, Semestre, Année.
- **Top utilisateurs** (configurable) par catégories d'actions sur la période.
- **Alertes** :
  - Alerte week-end : pic de non-réconciliations détecté sur week-end.
  - Alerte J+2 : commentaires obligatoires pour tout service non « Réconcilié & validé » (comptage `missingJ1BlockingCommentsCount`).
- **Export CSV** du tableau.
- **Filtrage « Problèmes week-end »** (activer/désactiver).

**Statuts / traitements visibles** (référence) :
- Statuts : `OK`, `NOK`, `REPORTING INCOMPLET`, `REPORTING INDISPONIBLE`, `EN COURS.....`
- Traitements : « En cours de traitement » (Support), « En cours de validation » (CDO), « En cours de clôture » (GROUP), « Terminé », « Validé & clôturé »

### 3.3 Correspondances (`/matches`)

Liste des transactions rapprochées (matchées). 
Actions disponibles : *Enregistrer vers Écart BO Summary* (permet de faire remonter certaines correspondances vers le suivi des écarts).

### 3.4 Écarts BO (`/ecart-bo`)

Liste des transactions présentes uniquement côté BO (écarts BO).

Actions de sauvegarde/régularisation proposées :
- **Écart Solde**
- **TRX SF**
- **Import OP**

Ces actions alimentent le circuit de suivi/régularisation (cf. Suivi des écarts).

### 3.5 Écarts Partenaire (`/ecart-partner`)

Liste des transactions présentes uniquement côté Partenaire (écarts Partenaire).

Actions proposées :
- **Import OP**
- **Créer OPPART**

Ces actions permettent de générer des écritures/éléments dans le circuit OPPART/OP.

### 3.6 Suivi des écarts J-1 & J+1 (`/ecart-bo-summary`)

Suivi transversal des écarts avec focus sur J-1 et J+1.
- Sélection d'**environnement (ENV)**.
- **Sauvegarde** des éléments suivis.
- Permet de suivre l'évolution/régularisation des écarts dans le temps.

### 3.7 Rapport réconciliation (`/reconciliation-report`)

Rapport détaillé par réconciliation avec gestion des validations.

Caractéristiques :
- **Niveaux de validation configurables** (via `/configuration/niveaux-validation-reco`).
- **Statuts et traitements** : gestion par ligne avec prise en compte du verrouillage.
- **Verrouillage** : lignes `status === 'OK' && traitement === 'Terminé'` verrouillées.
- **Tickets GLPI** : association/gestion le cas échéant.
- **Transfert d'écarts vers correspondances**.
- **Historique d'audit** des actions.

### 3.8 Rapport BO vs Partenaire (`/rapport-reconciliation-bo-partenaire`)

Rapport comparatif BO / Partenaire.
- **Exports** : Excel et PDF.
- Destiné à la restitution consolidée entre BO et fichiers Partenaire.

### 3.9 Contrôle interne BO vs Partenaire (`/controle-interne-bo-partenaire`)

Contrôle interne mensuel par ENV.
- Vue consolidée pour le contrôle/rapprochement mensuel.
- S'appuie sur les données `result8rec`, `ecart-bo-summary`, `reconciliation-report`.

---

## 4. Workflow type (recommandé)

### Scénario 1 : Réconciliation rapide (Magique)
1. Aller dans **Réconciliation > Lanceur** → choisir **Magique**.
2. Déposer 1 fichier BO + N fichiers Partenaire (CSV/XLSX/XLS).
3. Laisser la détection automatique s'exécuter. Si alerte de faible confiance → basculer en **Assisté**.
4. Consulter les résultats dans **Résultats > Vue d'ensemble** et naviguer vers correspondances/écarts selon besoin.

### Scénario 2 : Contrôle fin des clés (Manuel)
1. **Réconciliation > Lanceur** → **Manuel** → **Sélection colonnes clés**.
2. Ajuster colonnes clés BO/Partenaire, clés supplémentaires, seuil de confiance.
3. Charger les fichiers sur `/upload` et exécuter.
4. Analyser via **Vue d'ensemble**, puis traiter **Écarts BO/Partenaire**.

### Scénario 3 : Avec règles métier (Assisté)
1. **Réconciliation > Lanceur** → **Assisté**.
2. Charger fichiers sur `/upload-assisted`, choisir règle (Standard/Ratio/Personnalisée), renseigner ratio/tolérance et filtres (Agences/Services/Statuts).
3. Exécuter et traiter les résultats.

### Scénario 4 : Suivi et validation
1. **Résultats > État des réconciliations** : suivre avancement par période, traiter alertes J+2 et points week-end.
2. **Résultats > Écarts BO / Écarts Partenaire** : régulariser via les actions proposées (Écart Solde/TRX SF/Import OP/Créer OPPART).
3. **Résultats > Rapport réconciliation** : assurer les validations selon niveaux configurés (verrouillage des lignes OK + Terminé).
4. **Résultats > Suivi des écarts J-1 & J+1** : suivre la traçabilité dans le temps.
5. **Rapport BO vs Partenaire / Contrôle interne** : pour restitution et contrôle mensuel.

---

## 5. Bonnes pratiques et points de vigilance

- **Confiance détection magique** : si < 70 %, privilégier le mode **Assisté** pour fiabiliser les clés de rapprochement.
- **Alertes État des réconciliations** : ne pas négliger les commentaires J+2 obligatoires sur services non « Réconcilié & validé ».
- **Verrouillage** : une fois `OK` + `Terminé`, une ligne est verrouillée dans le rapport de réconciliation (pas de modification).
- **Traçabilité** : utiliser *Rapport réconciliation* (audit/historique) et *Suivi des écarts J-1 & J+1* pour le suivi dans le temps.
- **Régularisation** : privilégier les actions dédiées depuis *Écarts BO/Partenaire* (plutôt que des modifications manuelles hors circuit) pour maintenir la traçabilité.

---

## 6. Glossaire (référence)

| Terme | Signification |
| :----- | :------------ |
| BO | Back-Office (référence principale) |
| Partenaire | Fichier/opérations du partenaire à rapprocher |
| Match / Correspondance | Transaction trouvée des deux côtés (rapprochée) |
| Écart BO | Présent uniquement côté BO |
| Écart Partenaire | Présent uniquement côté Partenaire |
| Incohérence | Écart de montant/attribut empêchant le rapprochement simple |
| OPPART | Opération Partenaire (création depuis écarts partenaire) |
| TRX SF | Transaction SF (à traiter via circuit dédié) |
| ENV | Environnement |
| J-1 / J+1 | Jour précédent / Jour suivant (suivi des écarts) |

---

*Document généré à partir de l'analyse du code source (navigation, composants Réconciliation/Résultats, i18n FR).*
