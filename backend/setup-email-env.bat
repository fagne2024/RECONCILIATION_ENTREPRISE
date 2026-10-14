@echo off
REM Script de configuration des variables d'environnement pour l'envoi d'emails
REM Usage: setup-email-env.bat

echo ========================================
echo Configuration Email - Reconciliation App
echo ========================================
echo.
echo Ce script configure les variables d'environnement pour l'envoi d'emails.
echo Les variables seront valides uniquement pour cette session de terminal.
echo.
echo IMPORTANT: Pour Gmail, vous devez utiliser un "Mot de passe d'application"
echo et non votre mot de passe principal.
echo.
echo Pour creer un mot de passe d'application Gmail:
echo 1. Allez sur https://myaccount.google.com/security
echo 2. Activez la verification en deux etapes si ce n'est pas deja fait
echo 3. Dans "Mots de passe des applications", creez un nouveau mot de passe
echo 4. Utilisez ce mot de passe de 16 caracteres pour MAIL_PASSWORD
echo.
echo ========================================
echo.

set /p MAIL_HOST="Entrez le serveur SMTP (par defaut: smtp.gmail.com): "
if "%MAIL_HOST%"=="" set MAIL_HOST=smtp.gmail.com

set /p MAIL_PORT="Entrez le port SMTP (par defaut: 587): "
if "%MAIL_PORT%"=="" set MAIL_PORT=587

set /p MAIL_USERNAME="Entrez votre adresse email: "
if "%MAIL_USERNAME%"=="" (
    echo Erreur: L'adresse email est requise!
    pause
    exit /b 1
)

set /p MAIL_PASSWORD="Entrez votre mot de passe d'application: "
if "%MAIL_PASSWORD%"=="" (
    echo Erreur: Le mot de passe est requis!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Configuration appliquee:
echo ========================================
echo MAIL_HOST=%MAIL_HOST%
echo MAIL_PORT=%MAIL_PORT%
echo MAIL_USERNAME=%MAIL_USERNAME%
echo MAIL_PASSWORD=******** (masque pour securite)
echo ========================================
echo.
echo Les variables d'environnement sont maintenant configurees pour cette session.
echo Vous pouvez maintenant demarrer l'application avec: mvn spring-boot:run
echo.
echo Note: Redemarrez ce script si vous fermez cette fenetre de terminal.
echo.

pause









