# Environnement de test

Cet environnement permet de faire tourner l'application sur une **base de données
MySQL dédiée aux tests**, totalement séparée de la base de développement /
production (`Reconciliation_app`).

## Vue d'ensemble

| Composant | Développement | Test | Production |
|---|---|---|---|
| Profil Spring | `dev` | `test` | `prod` |
| Base de données | `top20` | **`top20_entreprise_test`** | `top20` |
| Port backend | `8085` | **`8086`** | `8080` |
| Port frontend (local) | `4200` | **`4201`** | servi par IIS |
| Schéma | Flyway | **Flyway** | Flyway |
| Emails | SMTP Gmail (optionnel) | **désactivés** (SMTP local) | Azure / SMTP |

Fichiers concernés :

- `backend/src/main/resources/application-test.properties` : configuration du profil `test` ;
- `start-test-env.ps1` / `stop-test-env.ps1` (racine) : démarrage / arrêt de l'environnement complet ;
- `backend/start-test.ps1` : démarrage local du backend sur la base TEST ;
- `frontend/proxy.test.conf.json` : proxy Angular vers le backend de test (port 8086) ;
- `frontend/package.json` : script `npm run start:test` (frontend sur le port 4201) ;
- `backend/.env.test` : secrets locaux, **non versionné** (généré automatiquement).

> ⚠️ Ne jamais faire pointer ce profil vers la base `Reconciliation_app`.
> `start-test.ps1` refuse de démarrer si l'URL cible exactement cette base.

## Démarrage local

### Démarrage rapide (backend + frontend)

Depuis la racine du dépôt :

```powershell
.\start-test-env.ps1          # ouvre une fenêtre backend (8086) et une fenêtre frontend (4201)
.\stop-test-env.ps1           # arrête les processus des ports 8086 et 4201
```

Ou double-clic sur `start-test-env.cmd` / `stop-test-env.cmd`.

- Un service déjà démarré (port occupé) n'est pas relancé.
- Le script attend que les deux ports répondent puis ouvre http://localhost:4201.
- Options : `-NoBackend`, `-NoFrontend`, `-NoBrowser`, `-TimeoutSeconds 300`.
- `stop-test-env.ps1` ne touche jamais l'environnement de développement (8085 / 4200).

Le détail des étapes manuelles suit.

### 1. Prérequis

- MySQL 8 démarré sur `localhost:3306` ;
- Java 17 et Maven dans le `PATH` ;
- un compte MySQL autorisé à créer la base (ou la base créée manuellement).

La base est créée automatiquement au premier démarrage grâce à
`createDatabaseIfNotExist=true`. Si le compte MySQL n'a pas ce droit, créez-la
manuellement :

```sql
CREATE DATABASE top20_entreprise_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```powershell
cd backend
.\start-test.ps1
```

Au premier lancement, le script :

1. crée `backend/.env.test` avec un secret JWT aléatoire persistant ;
2. vérifie que la base cible est bien une base de test ;
3. active le profil Spring `test` ;
4. lance `mvn spring-boot:run` sur le port **8086**.

Flyway crée ensuite automatiquement le schéma dans `top20_entreprise_test`
(migrations `V1` à `V20` comprises).

Le compte plateforme est initialisé au premier démarrage :

| Paramètre | Valeur par défaut |
|---|---|
| Utilisateur | `superadmin` |
| Mot de passe | `passer123` |
| Email | vide (aucun envoi) |

Le changement de mot de passe est obligatoire à la première connexion.
Ces valeurs peuvent être surchargées avec `TEST_SUPER_ADMIN_USERNAME`,
`TEST_SUPER_ADMIN_PASSWORD` et `TEST_SUPER_ADMIN_EMAIL`.

### 3. Frontend

Dans un second terminal :

```powershell
cd frontend
npm run start:test
```

Le frontend est disponible sur **http://localhost:4201** et toutes les requêtes
`/api` sont relayées vers le backend de test (`http://localhost:8086`).

## Configuration (`backend/.env.test`)

Le fichier est généré automatiquement, ignoré par Git et chargé par le profil
`test`. Les variables d'environnement déjà définies sont prioritaires.

Si `TEST_DB_USERNAME` / `TEST_DB_PASSWORD` sont vides, `start-test.ps1` reprend
automatiquement `DB_USERNAME` / `DB_PASSWORD` de `backend/.env.dev` (même
instance MySQL locale). Pour une base de test distante, renseignez explicitement
les variables `TEST_DB_*`.

| Variable | Défaut | Description |
|---|---|---|
| `TEST_DB_URL` | `jdbc:mysql://localhost:3306/top20_entreprise_test?...` | URL JDBC de la base TEST |
| `TEST_DB_USERNAME` | `root` | Utilisateur MySQL |
| `TEST_DB_PASSWORD` | *(vide)* | Mot de passe MySQL |
| `TEST_JWT_SECRET` | généré | Secret JWT du profil test (≥ 32 caractères) |
| `TEST_SERVER_PORT` | `8086` | Port HTTP du backend |
| `TEST_APP_URL` | `http://localhost:4201` | URL utilisée dans les emails |
| `TEST_ALLOWED_ORIGINS` | `http://localhost:4201,...` | Origines CORS autorisées |
| `TEST_WATCH_FOLDER` | `../watch-folder-test` | Dossier de dépôt isolé |
| `TEST_WATCH_FOLDER_MODELS` | `../watch-folder-test/models` | Modèles isolés |
| `TEST_MAIL_HOST` | `localhost` | SMTP de test (MailHog par défaut) |
| `TEST_MAIL_PORT` | `1025` | Port SMTP de test |
| `TEST_MAIL_USERNAME` / `TEST_MAIL_PASSWORD` | *(vide)* | Identifiants SMTP de test |
| `TEST_MAIL_AUTH` / `TEST_MAIL_STARTTLS` | `false` | Options SMTP de test |
| `TEST_SUPER_ADMIN_USERNAME` | `superadmin` | Compte plateforme initial |
| `TEST_SUPER_ADMIN_PASSWORD` | `passer123` | Mot de passe initial |
| `TEST_SUPER_ADMIN_EMAIL` | *(vide)* | Email du compte initial |

Exemple de fichier :

```properties
TEST_DB_URL=jdbc:mysql://localhost:3306/top20_entreprise_test?createDatabaseIfNotExist=true&allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC&allowMultiQueries=true&useUnicode=true&characterEncoding=UTF-8
TEST_DB_USERNAME=root
TEST_DB_PASSWORD=mon-mot-de-passe
TEST_JWT_SECRET=un-secret-de-test-d-au-moins-32-caracteres
TEST_SERVER_PORT=8086
```

## Isolation

Le profil `test` isole volontairement l'environnement :

- **base dédiée** `top20_entreprise_test` (aucune donnée de dev/prod) ;
- **dossier de dépôt dédié** `watch-folder-test/` (ignoré par Git) ;
- **emails désactivés** : SMTP local `localhost:1025` (compatible MailHog) et
  relance quotidienne des commentaires de blocage désactivée (`cron=-`) ;
- **compte plateforme sans email** : aucun message envoyé vers une boîte réelle ;
- **cookie de session dédié** `AUTH_TOKEN_TEST` : permet d'être connecté
  simultanément au dev (`localhost:4200`) et au test (`localhost:4201`) sans
  conflit de cookie JWT ;
- **DevTools désactivé** : comportement proche de la production.

Pour visualiser les emails de test, lancez par exemple MailHog sur le port 1025
(interface web sur `http://localhost:8025`).

## Déploiement sur un serveur de test

Le profil `test` est embarqué dans le jar. Sur le serveur, définissez les
variables d'environnement avant de lancer l'application :

```powershell
$env:SPRING_PROFILES_ACTIVE = 'test'
$env:TEST_DB_URL      = 'jdbc:mysql://localhost:3306/top20_entreprise_test?createDatabaseIfNotExist=true&allowPublicKeyRetrieval=true&useSSL=false&serverTimezone=UTC&allowMultiQueries=true&useUnicode=true&characterEncoding=UTF-8'
$env:TEST_DB_USERNAME = 'reconciliation_test'
$env:TEST_DB_PASSWORD = '<mot-de-passe>'
$env:TEST_JWT_SECRET  = '<secret 48 caracteres>'
$env:TEST_SERVER_PORT = '8086'
$env:TEST_APP_URL     = 'https://reco-test.mondomaine.com'
$env:TEST_ALLOWED_ORIGINS = 'https://reco-test.mondomaine.com'

java -jar csv-reconciliation-1.0.0.jar
```

Le schéma est créé/mis à jour automatiquement par Flyway au démarrage.
Pour un environnement de recette accessible depuis un autre poste, pensez à
ouvrir le port `TEST_SERVER_PORT` et à configurer le reverse proxy (IIS/Nginx)
vers ce port.

## Différence avec les tests automatisés (`mvn test`)

| | Environnement de test (ce document) | Tests automatises |
|---|---|---|
| Fichier | `backend/src/main/resources/application-test.properties` | `backend/src/test/resources/application-test.properties` |
| Base | `top20_entreprise_test` | `reco_test` (jetable) |
| Schéma | Flyway | Hibernate `create-drop` |
| Lancement | `start-test.ps1` | `mvn test` |

Les deux fichiers portent le même nom de profil mais ne se chargent pas dans le
même contexte : lors de `mvn test`, le classpath de test est prioritaire et
utilise la base jetable `reco_test`. Le fichier de `src/main/resources` sert
uniquement à l'exécution de l'application.

## Remise à zéro de la base de test

```powershell
mysql -u root -p -e "DROP DATABASE IF EXISTS top20_entreprise_test;"
cd backend
.\start-test.ps1
```

Flyway reconstruit alors un schéma complet et un nouveau compte `superadmin`
est créé.

## Dépannage

| Problème | Piste |
|---|---|
| `Access denied for user` | Vérifier `TEST_DB_USERNAME` / `TEST_DB_PASSWORD` dans `.env.test` |
| `Unknown database` | Accorder le droit `CREATE` ou créer la base manuellement |
| `Table ... doesn't exist` | Flyway n'a pas tourné : vérifier `spring.flyway.enabled` et les logs |
| `Port 8086 already in use` | Changer `TEST_SERVER_PORT` (et le proxy frontend) |
| Erreur Flyway de checksum | La base de test est corrompue : la recréer (voir ci-dessus) |
| `401` avec des identifiants corrects | Ancien cookie `AUTH_TOKEN` du dev envoyé au backend test. Le profil test utilise désormais `AUTH_TOKEN_TEST` ; sinon, vider les cookies de `localhost` et reconnecter |
| Le frontend appelle le mauvais backend | Vérifier `frontend/proxy.test.conf.json` et utiliser `npm run start:test` |
