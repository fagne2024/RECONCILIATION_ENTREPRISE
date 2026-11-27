# Synchronisation SharePoint → suivi des compenses OP

Écran : **Configuration > Synchronisation SharePoint** (administrateurs de l'entreprise).
Les lignes sont chargées dans le **suivi des compenses OP** de l'écran Banque.

## Fonctionnement

1. Pour chaque lien configuré, l'application identifie le site SharePoint (ex. `https://intouchgroup.sharepoint.com/sites/INTRANETTEST/...`) et y recherche, dans toutes les bibliothèques, les classeurs Excel dont le nom contient le **motif** (ex. `SN_SUIVI_OPS`).
2. Le **dernier fichier** est retenu : mois `AAAAMM` le plus récent dans le nom (`202611_SN_SUIVI_OPS.xlsx`), puis date de modification.
3. Les feuilles **Compense client** et **Compense fournisseur** sont lues (noms modifiables ; casse et accents ignorés). La ligne d'en-tête est cherchée dans les 20 premières lignes :
   - client : Date, Code agence, Banque, Compte bancaire, Montant, Mode de paiement, Référence, ID ticket ;
   - fournisseur : Date, Service, Réseau, Banque, Compte bancaire, Montant, Référence, ID ticket.
   Les colonnes « Code » et « Code pays » n'ont pas d'équivalent dans le suivi et sont ignorées.
4. **Reprise** : pour chaque feuille, la dernière ligne chargée et son empreinte (clé de doublon) sont mémorisées. Le passage suivant commence à la ligne qui suit. Si cette ligne a bougé (insertion ou suppression au-dessus), la feuille est relue entièrement.
5. Seules les lignes **du mois du fichier** (mois du nom, à défaut mois en cours) sont chargées. Une ligne sans date ou sans montant n'est pas chargée et sera relue au passage suivant.
6. **Doublons** : même règle que l'import manuel du suivi (référence, ou date + agence/service + montant + banque sans référence) ; une ligne déjà présente n'est jamais rechargée.
7. Quand un nouveau fichier apparaît (nouveau mois), la lecture repart du début de ce fichier.

Le job vérifie chaque minute si une **heure de lancement** est atteinte (heure du serveur). Un créneau n'est lancé qu'une fois, même si plusieurs backends partagent la base. Chaque exécution (automatique ou manuelle) est visible dans l'historique de l'écran.

Boutons par lien : **Tester** (montre le fichier trouvé et les lignes qui seraient chargées, sans rien enregistrer), **Synchroniser maintenant**, **Réinitialiser le curseur** (relire tout le fichier ; les lignes déjà chargées sont écartées comme doublons).

## Prérequis : application Microsoft Entra ID

L'accès se fait par Microsoft Graph avec un compte applicatif (pas de compte utilisateur). À faire une fois par un administrateur Microsoft 365 :

1. Portail Entra ID > **Inscriptions d'applications** > Nouvelle inscription (ex. « ReconciliApp SharePoint »), comptes de cet annuaire uniquement.
2. **Autorisations de l'API** > Ajouter > Microsoft Graph > **Autorisations d'application** > `Sites.Read.All`, puis **Accorder le consentement administrateur**.
   Variante plus restrictive : `Sites.Selected`, puis donner à l'application le droit `read` sur le seul site `INTRANETTEST`.
3. **Certificats et secrets** > Nouveau secret client : copier la *valeur* (affichée une seule fois).
4. Dans l'écran de configuration, renseigner l'**ID de l'annuaire (tenant)**, l'**ID d'application (client)** et le **secret**, puis **Tester la connexion**.

Le serveur doit pouvoir joindre `login.microsoftonline.com` et `graph.microsoft.com` en HTTPS (proxy système Java le cas échéant).

## Paramètres serveur

| Propriété | Défaut | Rôle |
|---|---|---|
| `sharepoint.sync.scheduler-enabled` (`SHAREPOINT_SYNC_SCHEDULER`) | `true` (`false` en profil dev) | Active le job planifié sur cette instance. Le lancement manuel fonctionne toujours. |
| `sharepoint.encryption-key` (`SHAREPOINT_ENCRYPTION_KEY`) | `jwt.secret` | Clé de chiffrement du secret client en base. Si elle change, ressaisir le secret. |
| `sharepoint.sync.check-cron` | `0 * * * * *` | Fréquence de vérification des heures de lancement. |
| `sharepoint.max-download-mb` | `150` | Taille maximale du fichier téléchargé. |

Le profil dev désactive le planificateur car il travaille sur la base de production avec un autre `jwt.secret`.
