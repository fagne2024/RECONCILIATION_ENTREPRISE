@echo off
REM Script de démarrage du backend avec configuration email automatique
REM Ce script configure les variables d'environnement email puis démarre l'application

echo ========================================
echo Démarrage Backend avec Configuration Email
echo ========================================
echo.

REM Configuration des variables d'environnement email
set MAIL_HOST=smtp.gmail.com
set MAIL_PORT=587
set MAIL_USERNAME=votre_email@gmail.com
set MAIL_PASSWORD=votre_mot_de_passe_application

REM Configuration de l'URL de l'application frontend
set APP_URL=http://reconciliation.intouchgroup.net:4200

echo Configuration Email:
echo   MAIL_HOST=%MAIL_HOST%
echo   MAIL_PORT=%MAIL_PORT%
echo   MAIL_USERNAME=%MAIL_USERNAME%
echo   MAIL_PASSWORD=******** (masqué)
echo.
echo Configuration Application:
echo   APP_URL=%APP_URL%
echo.

REM Configuration JVM optimisée
REM Note: MaxPermSize n'existe plus dans Java 8+, supprimé
set JAVA_OPTS=-Xms2g -Xmx4g -XX:+UseG1GC -XX:+UseStringDeduplication -XX:+OptimizeStringConcat

REM Passer les propriétés Spring Boot directement via les arguments
REM Utiliser --spring.mail.* pour passer directement les valeurs
REM Passer aussi l'URL de l'application pour les liens dans les emails
set SPRING_ARGS=--spring.mail.host=%MAIL_HOST% --spring.mail.port=%MAIL_PORT% --spring.mail.username=%MAIL_USERNAME% --spring.mail.password=%MAIL_PASSWORD% --app.url=%APP_URL%

echo Configuration JVM: %JAVA_OPTS%
echo.
echo Configuration Email Spring Boot:
echo   spring.mail.host=%MAIL_HOST%
echo   spring.mail.port=%MAIL_PORT%
echo   spring.mail.username=%MAIL_USERNAME%
echo   spring.mail.password=******** (masqué)
echo   app.url=%APP_URL%
echo.
echo ========================================
echo Démarrage de l'application...
echo ========================================
echo.

REM Démarrer l'application Spring Boot
REM Passer les propriétés via spring-boot.run.arguments ET via variables d'environnement
call mvn spring-boot:run -Dspring-boot.run.jvmArguments="%JAVA_OPTS%" -Dspring-boot.run.arguments="%SPRING_ARGS%"

pause

