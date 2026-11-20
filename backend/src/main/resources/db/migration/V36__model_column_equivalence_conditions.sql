-- =====================================================================
-- V36 : Configuration > Normalisation modèle — conditions de choix de l'équivalent.
--
-- Quand plusieurs en-têtes équivalents (A, B) d'une même colonne par défaut sont
-- présents dans le fichier, une condition peut fixer, ligne par ligne, celui qui
-- est repris (ex. « Service = CASHIN » → A, « Service = CASHOUT » → B), même si
-- les deux sont renseignés. Sans condition satisfaite : premier non vide (A puis B).
--
--   conditions : tableau JSON [{ "column": "...", "values": ["..."], "source": "..." }]
-- =====================================================================

ALTER TABLE `model_column_equivalence`
  ADD COLUMN `conditions` TEXT NULL AFTER `equivalents`;
