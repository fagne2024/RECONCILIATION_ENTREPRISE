-- =====================================================================
-- V14 : ajout de la règle TRAITEMENT.EXTENSIONS_FICHIERS pour l'entreprise 1
-- Règle LISTE paramétrable pour les extensions acceptées par le module Traitement
-- =====================================================================

INSERT INTO calculation_rule (
  entreprise_id,
  code,
  module,
  sous_module,
  libelle,
  description,
  type,
  expression,
  valeurs,
  valeur,
  unite,
  ordre,
  actif,
  systeme,
  date_creation,
  date_modification
)
SELECT
  1,
  'TRAITEMENT.EXTENSIONS_FICHIERS',
  'TRAITEMENT',
  'FORMATS_FICHIERS',
  'Extensions de fichiers acceptées',
  'Extensions (avec le point) reconnues par le module Traitement pour l''import des fichiers.',
  'LISTE',
  NULL,
  '[".csv", ".txt", ".tsv", ".xls", ".xlsx"]',
  NULL,
  NULL,
  310,
  1,
  1,
  NOW(6),
  NOW(6)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM calculation_rule cr
  WHERE cr.entreprise_id = 1
    AND cr.code = 'TRAITEMENT.EXTENSIONS_FICHIERS'
);
