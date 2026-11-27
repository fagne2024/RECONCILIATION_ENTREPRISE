# Réconciliation depuis BigQuery

Configuration : **Configuration > BigQuery** (administrateurs). Utilisation : **Lanceur > Réconciliation magique**, encadré « Source BigQuery » (droit « Réconciliation · Lanceur »).

## Principe

Une requête BigQuery remplace le fichier BO. Son résultat est écrit côté serveur en CSV nommé `PREFIXE_BQ_aaaammjj.csv` (ex. `TRXBO_BQ_20261126.csv`), pour être reconnu par le modèle BO dont le motif contient ce préfixe (`*TRXBO*.csv`). Les fichiers partenaires sont pris dans le sous-dossier `partenaires` du dossier surveillé de l'entreprise (ex. `watch-folder-prod\INTOUCH\partenaires`). La réconciliation elle-même reste celle du Lanceur (modèles, clés, résultats inchangés).

- **Préparation automatique** : aux heures configurées, chaque requête active est exécutée pour **la veille** (`@date` = J-1). Dans le Lanceur, l'extraction apparaît dans « Extractions prêtes ».
- **Un clic** : « Réconcilier (N partenaires) » charge l'extraction comme BO, ajoute les fichiers partenaires cochés (présélection : fichiers déposés depuis la date des opérations) et lance la réconciliation magique.
- **Manuel, à l'instant T** : « Extraire maintenant » exécute la requête choisie pour la date choisie ; le résultat devient le fichier BO.

Les fichiers partenaires Excel sont convertis en CSV (première feuille) par le serveur, car le Lanceur ne lit que du CSV en mode magique.

## Requêtes

- SQL standard BigQuery, lecture seule (`SELECT` / `WITH`, une seule instruction).
- Paramètre nommé `@date` (type DATE) : `WHERE DATE(date_transaction) = @date`. Sans `@date`, la requête est exécutée telle quelle.
- **Vérifier** : exécution à blanc (*dry run*, gratuite) qui renvoie les colonnes et le volume qui serait lu.
- Horodatages (`TIMESTAMP`) écrits en UTC au format `aaaa-mm-jj hh:mm:ss`. Les `;`, guillemets et retours à la ligne des valeurs sont remplacés par un espace (le lecteur CSV du Lanceur ne gère pas les guillemets).
- Limite de lignes par extraction (1 000 000 par défaut, configurable) : au-delà, l'extraction est refusée.
- Les 10 derniers fichiers de chaque requête sont conservés ; l'historique garde toutes les exécutions.

## Prérequis Google Cloud

1. Console Google Cloud > IAM > **Comptes de service** > créer un compte (ex. `reconciliapp-bq`).
2. Lui donner, sur le projet, les rôles **BigQuery Job User** et **BigQuery Data Viewer** (ou Data Viewer limité aux jeux de données utilisés).
3. Onglet **Clés** > Ajouter une clé > JSON : télécharger le fichier.
4. Dans Configuration > BigQuery : ID du projet, région (EU, US…), importer le fichier `.json`, **Enregistrer** puis **Tester la connexion**.

La clé est chiffrée en base (même clé de chiffrement que la synchronisation SharePoint, `sharepoint.encryption-key`). Le serveur doit joindre `oauth2.googleapis.com` et `bigquery.googleapis.com` en HTTPS.

## Paramètres serveur

| Propriété | Défaut | Rôle |
|---|---|---|
| `bigquery.scheduler-enabled` (`BIGQUERY_SCHEDULER`) | `true` (`false` en profil dev) | Préparation planifiée sur cette instance. |
| `bigquery.extract-dir` (`BIGQUERY_EXTRACT_DIR`) | `<app.watch-folder.path>-bigquery` | Dossier des CSV extraits (sous-dossier par entreprise puis par requête). Dérivé du dossier surveillé pour séparer test et prod. |
| `bigquery.check-cron` | `30 * * * * *` | Fréquence de vérification des heures de préparation. |
