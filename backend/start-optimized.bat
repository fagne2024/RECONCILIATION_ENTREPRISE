@echo off
echo 🚀 Démarrage du backend avec optimisations pour gros fichiers...
echo 💾 Configuration mémoire: 4GB heap, 2GB permgen
echo ⏱️  Timeout: 10 minutes
echo 📊 Batch size: 5000 enregistrements

set JAVA_OPTS=-Xms2g -Xmx4g -XX:MaxPermSize=512m -XX:+UseG1GC -XX:+UseStringDeduplication -XX:+OptimizeStringConcat

echo Configuration JVM: %JAVA_OPTS%
echo.

mvn spring-boot:run -Dspring-boot.run.jvmArguments="%JAVA_OPTS%"

pause 