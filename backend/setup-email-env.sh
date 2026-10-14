#!/bin/bash

# Script de configuration des variables d'environnement pour l'envoi d'emails
# Usage: source setup-email-env.sh (ou . setup-email-env.sh)

echo "========================================"
echo "Configuration Email - Reconciliation App"
echo "========================================"
echo ""
echo "Ce script configure les variables d'environnement pour l'envoi d'emails."
echo "Les variables seront valides uniquement pour cette session de terminal."
echo ""
echo "IMPORTANT: Pour Gmail, vous devez utiliser un 'Mot de passe d'application'"
echo "et non votre mot de passe principal."
echo ""
echo "Pour créer un mot de passe d'application Gmail:"
echo "1. Allez sur https://myaccount.google.com/security"
echo "2. Activez la vérification en deux étapes si ce n'est pas déjà fait"
echo "3. Dans 'Mots de passe des applications', créez un nouveau mot de passe"
echo "4. Utilisez ce mot de passe de 16 caractères pour MAIL_PASSWORD"
echo ""
echo "========================================"
echo ""

read -p "Entrez le serveur SMTP (par défaut: smtp.gmail.com): " MAIL_HOST
MAIL_HOST=${MAIL_HOST:-smtp.gmail.com}

read -p "Entrez le port SMTP (par défaut: 587): " MAIL_PORT
MAIL_PORT=${MAIL_PORT:-587}

read -p "Entrez votre adresse email: " MAIL_USERNAME
if [ -z "$MAIL_USERNAME" ]; then
    echo "Erreur: L'adresse email est requise!"
    return 1 2>/dev/null || exit 1
fi

read -s -p "Entrez votre mot de passe d'application: " MAIL_PASSWORD
echo ""
if [ -z "$MAIL_PASSWORD" ]; then
    echo "Erreur: Le mot de passe est requis!"
    return 1 2>/dev/null || exit 1
fi

echo ""
echo "========================================"
echo "Configuration appliquée:"
echo "========================================"
echo "MAIL_HOST=$MAIL_HOST"
echo "MAIL_PORT=$MAIL_PORT"
echo "MAIL_USERNAME=$MAIL_USERNAME"
echo "MAIL_PASSWORD=******** (masqué pour sécurité)"
echo "========================================"
echo ""
echo "Les variables d'environnement sont maintenant configurées pour cette session."
echo "Vous pouvez maintenant démarrer l'application avec: mvn spring-boot:run"
echo ""
echo "Note: Redémarrez ce script si vous fermez ce terminal."
echo ""

# Export des variables pour qu'elles soient disponibles dans le shell
export MAIL_HOST
export MAIL_PORT
export MAIL_USERNAME
export MAIL_PASSWORD













