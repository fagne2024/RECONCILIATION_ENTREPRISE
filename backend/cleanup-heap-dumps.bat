@echo off
REM Script de nettoyage des anciens heap dumps (Windows)
REM À exécuter avant chaque redémarrage de l'application pour éviter que la JVM
REM ne soit bloquée pour écrire un nouveau dump lors d'un OOM

set HEAP_DUMP_DIR=.\logs
set MAX_DUMPS_TO_KEEP=3
set MAX_AGE_DAYS=7

echo === Nettoyage des heap dumps ===
echo Repertoire: %HEAP_DUMP_DIR%
echo Conserver les %MAX_DUMPS_TO_KEEP% plus recents
echo Supprimer les fichiers de plus de %MAX_AGE_DAYS% jours

if not exist "%HEAP_DUMP_DIR%" (
    echo Repertoire %HEAP_DUMP_DIR% n'existe pas, rien a nettoyer
    exit /b 0
)

REM Compter les fichiers .hprof
set HPDUMP_COUNT=0
for %%f in ("%HEAP_DUMP_DIR%\*.hprof") do set /a HPDUMP_COUNT+=1
echo Fichiers .hprof trouves: %HPDUMP_COUNT%

if %HPDUMP_COUNT% equ 0 (
    echo Aucun heap dump a nettoyer
    exit /b 0
)

REM Supprimer les fichiers anciens de plus de MAX_AGE_DAYS
echo Suppression des heap dumps de plus de %MAX_AGE_DAYS% jours...
forfiles /p "%HEAP_DUMP_DIR%" /m *.hprof /d -%MAX_AGE_DAYS% /c "cmd /c del @path" 2>nul

REM Si encore trop de fichiers, garder seulement les MAX_DUMPS_TO_KEEP plus recents
set REMAINING=0
for %%f in ("%HEAP_DUMP_DIR%\*.hprof") do set /a REMAINING+=1

if %REMAINING% gtr %MAX_DUMPS_TO_KEEP% (
    set /a TO_DELETE=%REMAINING% - %MAX_DUMPS_TO_KEEP%
    echo Trop de heap dumps (%REMAINING%), suppression des %TO_DELETE% plus anciens...
    
    REM Utiliser PowerShell pour trier par date et supprimer les plus anciens
    powershell -Command "
        $files = Get-ChildItem -Path '%HEAP_DUMP_DIR%' -Filter '*.hprof' -File | Sort-Object LastWriteTime
        $toDelete = $files | Select-Object -First %TO_DELETE%
        foreach ($file in $toDelete) {
            Write-Host \"Suppression: $($file.FullName)\"
            Remove-Item -Force $file.FullName
        }
    "
)

set FINAL_COUNT=0
for %%f in ("%HEAP_DUMP_DIR%\*.hprof") do set /a FINAL_COUNT+=1
echo === Nettoyage termine ===
echo Heap dumps restants: %FINAL_COUNT%

REM Afficher l'espace disque
echo Espace disque dans %HEAP_DUMP_DIR%:
dir "%HEAP_DUMP_DIR%" | findstr "fichier(s)"