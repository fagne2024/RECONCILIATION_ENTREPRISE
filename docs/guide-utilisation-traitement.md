# Guide d'utilisation — Module Traitement (`/traitement`)

Ce guide décrit le fonctionnement du module **Traitement** de ReconciliApp : import, normalisation, contrôle et export de fichiers BO / Partenaire avant réconciliation.

---

## 1. À quoi sert ce module ?

Le module **Traitement** est un atelier de préparation de fichiers. Il permet de :

- importer un ou plusieurs fichiers (CSV, TSV, TXT, XLS, XLSX) ;
- détecter automatiquement les en-têtes, le séparateur CSV et le format ;
- normaliser les données via des **modèles de traitement** (la même logique que le mode assisté de la réconciliation) ;
- nettoyer, filtrer, transformer et enrichir les données ;
- exporter le résultat en CSV, XLS ou XLSX, globalement ou par lots.

**Important** : le traitement s'exécute **dans le navigateur** (pas d'upload serveur). Les fichiers restent donc sur le poste de l'utilisateur. Un bandeau de suivi permet de continuer à travailler ailleurs dans l'application pendant un traitement long.

### Accès
- Menu **Traitement** (route `/traitement`).
- Contrôlé par `AuthGuard` + `ModuleAccessGuard` avec le module `Traitement` et la permission **consulter**.
- La route est accessible à tout utilisateur ayant ce droit, sans être administrateur.

---

## 2. Découverte de l'écran

### Barre supérieure
| Élément | Rôle |
| :-- | :-- |
| **Tout afficher / Tout masquer** | Ouvre ou replie toutes les sections de l'écran d'un coup. |
| **+ Nouveau traitement** | Vide les fichiers chargés, les données, les paramètres et la sauvegarde locale, puis remet l'écran à zéro. |

### Indicateurs rapides
En haut de page : **nombre de fichiers chargés**, **nombre de lignes** et **nombre de colonnes** du jeu de données courant.

### Sections de travail
Les sections sont repliées par défaut. Chacune possède son bouton **Afficher / Masquer** :

1. Traitement automatique (recommandé)
2. Total Energie
3. Compilation en-têtes différents
4. Séparation des feuilles Excel
5. Fusion multi-fichiers CSV
6. Aperçu des données combinées
7. Sélection des colonnes à conserver
8. Extraction de données
9. Filtrer les lignes
10. Renommer un en-tête
11. Concaténer plusieurs colonnes
12. Export par type
13. Suppression de doublons
14. Export par date
15. Formatage automatique

### Persistance de session
L'écran sauvegarde automatiquement une partie de son état (colonnes, paramètres, filtres, page courante…) dans le navigateur (`localStorage`) pour les fichiers de **moins de 10 000 lignes**. Au retour sur la page, la configuration est restaurée. Les fichiers eux-mêmes ne sont pas conservés : ils doivent être rechargés. **+ Nouveau traitement** efface cette sauvegarde.

---

## 3. Étape 1 — Importer les fichiers

### Zone d'import
- Glisser-déposer dans la zone dédiée, ou bouton **Sélectionner des fichiers**.
- Formats acceptés : `.csv`, `.txt`, `.tsv`, `.xls`, `.xlsx` (+ types MIME associés).
- Sélection multiple possible : les fichiers sont **fusionnés** en un seul jeu de données (colonnes en union).

### Ce qui est fait automatiquement
- **Détection de l'encodage / caractères spéciaux** et correction des libellés d'en-tête.
- **Détection des en-têtes** : les lignes de préambule (relevés, métadonnées, titres de document) sont ignorées ; la ligne d'en-tête la plus plausible est retenue.
- **Détection du séparateur CSV** (`;`, `,`, tabulation, `|`) avec prévisualisation.
- **Prévisualisation CSV** : séparateur détecté, nombre de colonnes, aperçu des lignes. Il faut cliquer sur **✅ Confirmer l'import** pour lancer le traitement (ou **❌ Annuler**).

### Cas particuliers détectés
- **Fichiers Orange Money** : un bandeau « Fichier Orange Money détecté » s'affiche.
  - Ignore les lignes au-dessus de la première colonne « N° ».
  - Applique un **filtre automatique** sur le statut « Succès » et sur les types d'opération « Cash in » / « Merchant Payment » (et variantes : versement, dépôt, marchand, recharge, top-up…).
  - Affiche automatiquement les colonnes utiles (Référence, Débit, Crédit, N° de Compte, DATE, Service, Statut).
  - Concatène automatiquement **Date + Heure** en colonne `DATE`.
- **Fichiers GDJ (La Gabonaise des Jeux)** : le préambule de 5 lignes est ignoré, seules les transactions sont compilées.

### Fichiers volumineux
- Optimisé pour des fichiers jusqu'à **1 million de lignes** (2 Go max).
- Lecture par lots / chunks, avec barre de progression.
- Fichiers Excel > 100 Mo : traitement alternatif ; > 200 Mo : lecture en streaming, première feuille uniquement.
- Au-delà des capacités du navigateur, les solutions proposées sont : convertir en CSV, découper le fichier (par mois, trimestre), supprimer les colonnes inutiles.

### Affichage des données
- Pagination (50 / 100 / 200 / 500 / 1000 lignes), ou **Afficher toutes les lignes**.
- Panneau de statistiques pour les gros fichiers (total lignes, colonnes, taille estimée) avec conseils de performance.
- **Réorganiser les colonnes** : activer le mode, glisser-déposer les en-têtes ou utiliser les flèches ↑↓, puis **Appliquer** (ou **Annuler**). **Réinitialiser l'ordre** restaure l'ordre d'origine.
- **Export rapide** du tableau : nom de fichier personnalisable, puis **CSV**, **XLS** ou **XLSX**, avec barre de progression pour les gros volumes. À l'export CSV, une colonne d'en-tête `GRX` est renommée `PAYS`.

---

## 4. Étape 2 — Traitement automatique (recommandé)

Section **Traitement automatique** : c'est le parcours principal pour normaliser un fichier BO ou Partenaire avant réconciliation.

### 4.1 Principe
On charge un ou plusieurs fichiers, on choisit un ou plusieurs **modèles de traitement**, puis on lance le traitement. Chaque modèle applique ses règles de colonnes et son pré-traitement, et produit **un fichier téléchargé par modèle**.

> Les modèles sont configurés par un administrateur dans **Configuration > Modèles** (`/auto-processing-models`). Un modèle définit : nom, **pattern de fichier** (ex. `BO_*.csv`), type **BO / Partenaire**, règles de traitement des colonnes, **pré-traitement** (filtres de lignes, actions de formatage ordonnées) et éventuellement un **filtre de colonnes à l'export**.

### 4.2 Déroulé
1. **Fichiers à traiter** : cliquer dans la zone d'import ou glisser-déposer. Formats `.csv`, `.xls`, `.xlsx`, `.xlsm`, `.xlsb`. Plusieurs fichiers sont fusionnés.
2. **Modèle(s) de traitement** :
   - La liste des modèles se charge automatiquement.
   - Un **champ de recherche** filtre par nom, pattern ou type (`bo`, `partenaire`).
   - **Sélection automatique** : dès que le nom des fichiers correspond à un pattern, le modèle est présélectionné et un message l'indique (« Modèle détecté automatiquement : … »).
   - Si aucun modèle ne correspond : message « Aucun modèle ne correspond au nom des fichiers sélectionnés — choisissez-le manuellement. »
   - **Sélection multiple** (spécifique à `/traitement`) : cocher plusieurs modèles. Chacun sera appliqué aux mêmes fichiers et produira un fichier téléchargé distinct. Le bouton indique alors « Traiter N modèles ».
   - Le bouton **Afficher / Masquer la liste des modèles** permet de replier la liste.
3. **Colonne ENV (optionnel)** : possible uniquement quand **un seul** modèle est sélectionné.
   - Cocher « Ajouter la colonne ENV au fichier final ».
   - Choisir la valeur dans la liste. Une valeur est obligatoire si l'option est cochée.
4. **Colonnes à garder ou supprimer (optionnel)** — un seul modèle sélectionné :
   - Activer « Filtrer les colonnes à l'export ».
   - Toutes les colonnes du modèle sont listées ; **décocher** celles à exclure.
   - Boutons **Tout garder**, **Tout supprimer**, **Réinitialiser**.
   - Le filtre configuré dans le modèle est pré-appliqué.
5. **Suppression de doublons (optionnel)** :
   - Activer « Supprimer les doublons sur le fichier final ».
   - Par défaut, la déduplication utilise les **clés de réconciliation du modèle**.
   - Sinon, cocher les colonnes clés souhaitées (boutons **Clés du modèle**, **Tout décocher**).
   - Au moins une colonne doit être cochée pour lancer.
6. **Nom du fichier produit** :
   - **Date** : par défaut **J-1** ; modifiable.
   - **Suffixe texte** optionnel (80 caractères max).
   - Aperçu du nom final : `pattern[_texte]_AAAAMMJJ.ext`.
7. **Lancer** : bouton **Appliquer le traitement** (ou **Compiler et appliquer le traitement** si plusieurs fichiers, ou **Traiter N modèles** en multi-modèles).
   - Le bouton n'est actif que si : fichiers présents + modèle(s) sélectionné(s) + date renseignée + aucun traitement en cours.
8. **Résultat** :
   - Un ou plusieurs fichiers sont **téléchargés** automatiquement.
   - Un message de succès indique le fichier produit, le nombre de lignes et, le cas échéant, les doublons ignorés et le résumé du pré-traitement.
   - **Réinitialiser** vide le panneau de traitement.

### 4.3 Traitement en arrière-plan
Le job de traitement est publié dans un **bandeau global** visible sur toutes les pages :

| État | Affichage | Action |
| :-- | :-- | :-- |
| `running` | « Traitement en cours — *modèle* » + message de progression | — |
| `done` | « Traitement terminé — *modèle* » + liste des fichiers et lignes | **Télécharger** |
| `error` | « Échec du traitement — *modèle* » + message d'erreur | — |

Le bouton **×** masque le bandeau. On peut donc lancer un traitement, naviguer vers un autre écran, puis revenir télécharger le résultat.

### 4.4 Pré-traitement porté par le modèle
Les modèles peuvent appliquer, **avant** la production du fichier :
- des **filtres de lignes** : conserver uniquement les lignes dont une colonne contient certaines valeurs ;
- des **actions de formatage** ordonnées (glisser-déposer pour définir l'ordre 1 → n), avec sélection de colonnes et conditions d'application optionnelles ;
- un **filtre de colonnes à l'export**.

Ces règles sont visibles dans le message « Modèle sélectionné : … — *résumé* configurés ».

---

## 5. Étape 3 — Outils de préparation manuelle

### 5.1 Sélection des colonnes à conserver
- Cocher/décocher les colonnes (ou **Tout**), puis **Appliquer la sélection**.
- **Réinitialiser la sélection** restaure toutes les colonnes.

### 5.2 Extraction de données
Créer une nouvelle colonne à partir d'une colonne existante :
- **Colonne source** ;
- **Type d'extraction** : Domaine email, Gauche (n caractères), Droite (n caractères) ;
- **Nom de la nouvelle colonne** ;
- pour les extractions de caractères : **position de départ** et **nombre de caractères** ;
- un aperçu s'affiche avant validation ; **Extraire les données** ou **Réinitialiser**.

### 5.3 Filtrer les lignes
Deux modes cohabitent :

**Filtres multiples (recommandé)**
- **Ajouter un filtre** : chaque filtre possède une colonne, une liste de **valeurs à garder** (multi-sélection, option « Tous ») et une case d'activation.
- Suppression d'un filtre possible.
- **Appliquer tous les filtres** / **Réinitialiser tous les filtres**.

**Filtre unique (ancien système)**
- Une colonne, une multi-sélection de valeurs avec **recherche**, puis **Appliquer le filtre** / **Réinitialiser**.

### 5.4 Renommer un en-tête
Choisir la colonne, saisir le nouveau nom, cliquer sur **Renommer**.

### 5.5 Concaténer plusieurs colonnes
- Sélectionner plusieurs colonnes.
- **Mode ordre personnalisé** : ajouter les colonnes une à une, les réordonner (↑ ↓, position), les supprimer, définir l'ordre.
- Renseigner le **nom de la nouvelle colonne** et le **séparateur** (ex. espace, `-`, `/`).
- **Concaténer**.

### 5.6 Suppression de doublons
Cocher les colonnes servant de clé, puis **Supprimer les doublons**.

### 5.7 Formatage automatique
Huit traitements, activables indépendamment, avec sélection des colonnes concernées :

| Option | Paramètres | Effet |
| :-- | :-- | :-- |
| **Gérer les caractères** | Action (supprimer / garder), position (début, fin, position spécifique), nombre, gestion du **0 initial** | Supprime ou conserve les n premiers/derniers caractères ; gère les numéros de téléphone. |
| **Supprimer caractères spéciaux** | Chaîne à supprimer, mode (toutes occurrences / début / fin) | Ex. retirer `_CM`. |
| **Supprimer des nombres** | — | Retire tous les chiffres (0-9). |
| **Supprimer indicatif** | International (+XX), National français (0X), Personnalisé | Retire l'indicatif téléphonique. |
| **Supprimer décimales** | Séparateur (`,` ou `.`), garder les valeurs non nulles | Ex. `3000,00` → `3000`. |
| **Garder N derniers digits** | Nombre de digits | Ex. `774478320` avec 3 → `320`. |
| **Supprimer `.0` sur les dates** | — | Ex. `2024-01-15.0` → `2024-01-15`. |
| **Supprimer les espaces** | Tous / début / fin / multiples | Ex. `A B C` → `ABC`. |

Chaque option s'applique via son bouton **Appliquer**.

### 5.8 Export par type
Créer **un fichier par valeur** d'une colonne :
- choisir la **colonne de tri** puis les **valeurs à exporter** (Tout sélectionner / Tout désélectionner) ;
- définir un **préfixe**, un **suffixe** (`BO`, `PART`, personnalisé), une **description** ;
- choisir le format (**CSV / XLS / XLSX**) ;
- **Exporter par type**.

### 5.9 Export par date
Découper l'export en fichiers par période :
- choisir la **colonne de date** ;
- choisir la période : **Par jour**, **Par semaine**, **Par mois**, **Par heure**, **Par plage horaire** (durée en minutes paramétrable) ;
- choisir le format et le **préfixe** des fichiers (nommage `[préfixe]_[période]_[date]`) ;
- la liste des **périodes détectées** s'affiche, avec pagination ;
- **Exporter page courante** ou **Exporter toutes les pages** ;
- **Re-détecter les périodes** si les données ont changé ; **Réinitialiser**.

---

## 6. Outils spécialisés

### 6.1 Total Energie
**Fusion de deux fichiers**
- **Fichier 1** : doit contenir `Code PDA`, `Station`, `Numéro SIM`.
- **Fichier 2** : doit contenir une colonne `N° de compte`.
- La correspondance se fait entre **`N° de compte` (fichier 2)** et **`Numéro SIM` (fichier 1)**.
- Toutes les lignes du fichier 2 sont conservées ; les doublons sont autorisés ; les lignes sans correspondance sont conservées.
- **Traiter et fusionner** → aperçu + statistiques (lignes fusionnées, colonnes totales) → **Exporter le résultat**.

**Comparaison BO Agence / PARTNER Station**
- Charger un fichier contenant les colonnes `BO: Agence` (ou `BO_Agence`) et `PARTNER: Station` (ou `PARTENAIRE_Station`).
- **Comparer et ajouter le commentaire** ajoute une colonne `Commentaire` :
  - `OK` si les valeurs sont égales ;
  - sinon `Trx à annuler sur '[agence]' et à créer sur '[station]'`.
- **Récapitulatif par station** : nombre de commentaires **non OK** par station, avec agence BO, pourcentage et code couleur de sévérité ; total en pied de tableau ; export dédié.
- **Exporter le résultat comparaison** pour le détail complet.

### 6.2 Compilation en-têtes différents
Objectif : fusionner deux fichiers dont les en-têtes diffèrent.
1. **Fichier 1 — en-têtes à conserver** : charger le fichier de référence, puis cocher les en-têtes à garder (**Tout** / **Aucun**).
2. **Fichier 2 — colonnes à reporter** : charger le fichier de données, puis pour chaque colonne choisir l'**en-tête retenu** du fichier 1 (ou `— Ignorer —`).
3. **Compiler** : le résultat contient les lignes du fichier 1 (projetées sur les en-têtes retenus) puis celles du fichier 2 avec les valeurs reportées.
4. **Exporter le résultat** (Excel).

### 6.3 Séparation des feuilles Excel
Sépare chaque feuille d'un classeur en un fichier `.xlsx` distinct.
- Charger un fichier `.xls` / `.xlsx`.
- Vérifier/ajuster l'**en-tête personnalisé** (17 colonnes séparées par `;`). Le compteur indique les colonnes détectées sur 17.
- Option **Appliquer l'en-tête personnalisé à partir de la 2ᵉ feuille**.
- **Séparer et télécharger** : progression, conversion, puis **ZIP** contenant les fichiers générés (nom de feuille, lignes, nom de fichier).
- En cas d'échec de conversion `.xls` dans le navigateur, une **solution de secours Excel** est proposée : macro VBA `SeparerFeuillesEnteteComplet` à coller dans l'éditeur VBA (`Alt`+`F11`), avec largeurs de colonnes et en-tête gris appliqués.

### 6.4 Fusion multi-fichiers CSV
Fusionne un ensemble de fichiers CSV (ou un dossier complet) en un seul jeu de données.
- **Fichiers CSV à fusionner** (multi-sélection) ou **Sélectionner dossier (récursif)** via l'API File System (mode avancé).
- **Préfixe du nom de fichier** à retirer (ex. `MOOVGA_`).
- **Nom de la colonne identifiant** (ex. `Jour`) : l'identifiant est **extrait du nom du fichier** et ajouté dans cette colonne.
- **Séparateur CSV** : `;`, `,`, tabulation, `|`.
- **Fusionner** → statistiques (nb fichiers, total lignes, colonnes) + détail par fichier (fichier, identifiant extrait, lignes) + aperçu.
- Export : **Exporter le résultat** (Excel) ou **Exporter CSV** (recommandé pour les gros volumes).

---

## 7. Parcours recommandés

### Scénario A — Normaliser un fichier BO / Partenaire avant réconciliation
1. Charger le fichier dans **Traitement automatique**.
2. Vérifier le modèle détecté automatiquement (ou le choisir dans la liste / le rechercher).
3. Ajuster si besoin : colonne ENV, colonnes à l'export, déduplication.
4. Vérifier la date et le nom du fichier produit, puis lancer.
5. Télécharger le fichier produit (immédiatement ou depuis le bandeau de fond).
6. Utiliser ce fichier dans **Réconciliation** (manuel, assisté ou magique).

### Scénario B — Nettoyer un fichier sans modèle
1. Charger le fichier, confirmer l'import CSV.
2. Utiliser **Sélection des colonnes**, **Filtres**, **Formatage automatique**.
3. Vérifier l'**Aperçu des données combinées**.
4. Exporter en CSV/XLS/XLSX.

### Scénario C — Produire des fichiers par entité ou par période
1. Charger et préparer les données.
2. **Export par type** (une valeur de colonne = un fichier) ou **Export par date** (jour/semaine/mois/heure/plage).
3. Choisir format, préfixe/suffixe, puis exporter la page courante ou toutes les pages.

### Scénario D — Consolider plusieurs sources
- Sources hétérogènes avec en-têtes différents → **Compilation en-têtes différents**.
- Nombreux CSV d'un même dossier → **Fusion multi-fichiers CSV**.
- Classeur multi-feuilles → **Séparation des feuilles Excel**.

---

## 8. Bonnes pratiques

- **Privilégier les modèles de traitement** : ils garantissent la même normalisation que le mode assisté de la réconciliation et évitent les erreurs manuelles.
- **Vérifier le modèle auto-détecté** : le pattern est une aide, pas une garantie. Contrôler le nom et le type (BO / Partenaire).
- **Un fichier = un modèle** : en multi-modèles, chaque modèle produit son propre fichier ; vérifier la liste avant de lancer.
- **Tester sur un échantillon** avant de traiter un très gros volume.
- **Surveiller le bandeau de traitement** : ne pas relancer un job tant que le précédent est en cours.
- **Nommer explicitement les exports** (date + suffixe + description) pour retrouver les fichiers.
- **Éviter « Afficher toutes les lignes »** sur de gros volumes : préférer filtres et pagination.
- **Sauvegarder le résultat** avant d'utiliser **+ Nouveau traitement**, qui efface aussi la sauvegarde locale.
- Les données ne quittent pas le navigateur : la performance dépend de la mémoire du poste.

---

## 9. Dépannage

| Symptôme | Cause probable | Solution |
| :-- | :-- | :-- |
| « Aucun modèle ne correspond au nom des fichiers sélectionnés » | Pattern du modèle non conforme au nom du fichier | Choisir le modèle manuellement ou corriger le pattern côté administration. |
| Bouton de traitement inactif | Fichier manquant, aucun modèle sélectionné, date vide ou traitement en cours | Vérifier fichiers + modèle(s) + date ; attendre la fin du job. |
| « Veuillez choisir une valeur pour la colonne ENV » | Colonne ENV activée sans valeur | Choisir une valeur ou désactiver l'option. |
| « Activez la suppression de doublons uniquement après avoir coché au moins une colonne clé » | Déduplication active sans colonne | Cocher au moins une colonne ou désactiver l'option. |
| CSV mal découpé | Séparateur mal détecté | Vérifier le séparateur dans la prévisualisation, sinon réenregistrer le fichier avec un séparateur standard. |
| En-têtes décalés / préambule intégré | Ligne d'en-tête mal détectée | Vérifier le fichier source ; les préambules Orange Money/GDJ sont gérés automatiquement. |
| Fichier Excel refusé / plantage navigateur | Fichier trop volumineux | Convertir en CSV, découper par période, supprimer les colonnes inutiles. |
| Séparation `.xls` impossible | Conversion navigateur limitée | Utiliser la macro VBA de secours proposée dans la section. |
| Traitement terminé mais aucun fichier | Aucune donnée lisible ou aucun résultat produit | Consulter le message d'erreur du bandeau ; vérifier le contenu et le modèle. |
| Performances dégradées | Volume important + affichage complet | Filtrer, paginer, éviter « Afficher toutes les lignes ». |
| Paramètres perdus au retour | Sauvegarde locale limitée (> 1 Mo ou > 10 000 lignes) | Recharger les fichiers et reconfigurer ; la sauvegarde ne couvre pas les gros volumes. |

---

## 10. Glossaire

| Terme | Signification |
| :-- | :-- |
| **BO** | Back-Office (fichier de référence interne) |
| **Partenaire** | Fichier du partenaire à rapprocher |
| **Modèle de traitement** | Configuration nommée (pattern + type + règles colonnes + pré-traitement) appliquée à un fichier |
| **Pattern** | Masque de nom de fichier (ex. `BO_*.csv`) servant à détecter le bon modèle |
| **Pré-traitement** | Filtres de lignes + actions de formatage appliqués avant l'export final |
| **ENV** | Colonne d'environnement ajoutée au fichier final (optionnel) |
| **Déduplication** | Suppression des lignes identiques selon une ou plusieurs colonnes clés |
| **Total Energie** | Outil de fusion de deux fichiers (Code PDA/Station/Numéro SIM ↔ N° de compte) et de comparaison BO Agence / Partenaire Station |
| **Compilation en-têtes différents** | Fusion de deux fichiers de structures différentes avec mapping des colonnes |
| **Chunk** | Lot de lignes traité par le navigateur pour limiter la mémoire |
| **J-1** | Date de production par défaut du fichier de traitement (veille) |

---

*Document généré à partir de l'analyse du code source : `traitement.component.(ts|html)`, `file-upload.component.(ts|html)` (section embarquée), `traitement-background.service.ts`, `traitement-job-banner`, `auto-processing-models`, `app-routing.module.ts` et i18n FR.*
