#!/bin/bash
# Script de nettoyage des anciens heap dumps
# À exécuter avant chaque redémarrage de l'application pour éviter que la JVM
# ne soit bloquée pour écrire un nouveau dump lors d'un OOM

HEAP_DUMP_DIR="./logs"
MAX_DUMPS_TO_KEEP=3
MAX_AGE_DAYS=7

echo "=== Nettoyage des heap dumps ==="
echo "Répertoire: $HEAP_DUMP_DIR"
echo "Conserver les $MAX_DUMPS_TO_KEEP plus récents"
echo "Supprimer les fichiers de plus de $MAX_AGE_DAYS jours"

if [ ! -d "$HEAP_DUMP_DIR" ]; then
    echo "Répertoire $HEAP_DUMP_DIR n'existe pas, rien à nettoyer"
    exit 0
fi

# Compter les fichiers .hprof
HPDUMP_COUNT=$(find "$HEAP_DUMP_DIR" -maxdepth 1 -name "*.hprof" -type f | wc -l)
echo "Fichiers .hprof trouvés: $HPDUMP_COUNT"

if [ "$HPDUMP_COUNT" -eq 0 ]; then
    echo "Aucun heap dump à nettoyer"
    exit 0
fi

# Supprimer les fichiers anciens de plus de MAX_AGE_DAYS
echo "Suppression des heap dumps de plus de $MAX_AGE_DAYS jours..."
find "$HEAP_DUMP_DIR" -maxdepth 1 -name "*.hprof" -type f -mtime +$MAX_AGE_DAYS -exec rm -v {} \;

# Si encore trop de fichiers, garder seulement les MAX_DUMPS_TO_KEEP plus récents
REMAINING=$(find "$HEAP_DUMP_DIR" -maxdepth 1 -name "*.hprof" -type f | wc -l)
if [ "$REMAINING" -gt "$MAX_DUMPS_TO_KEEP" ]; then
    TO_DELETE=$((REMAINING - MAX_DUMPS_TO_KEEP))
    echo "Trop de heap dumps ($REMAINING), suppression des $TO_DELETE plus anciens..."
    find "$HEAP_DUMP_DIR" -maxdepth 1 -name "*.hprof" -type f -printf '%T@ %p\n' | sort -n | head -n "$TO_DELETE" | cut -d' ' -f2- | xargs -r rm -v
fi

FINAL_COUNT=$(find "$HEAP_DUMP_DIR" -maxdepth 1 -name "*.hprof" -type f | wc -l)
echo "=== Nettoyage terminé ==="
echo "Heap dumps restants: $FINAL_COUNT"

# Afficher l'espace disque libéré
echo "Espace disque dans $HEAP_DUMP_DIR:"
df -h "$HEAP_DUMP_DIR" 2>/dev/null || du -sh "$HEAP_DUMP_DIR"