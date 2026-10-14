-- Migration: Ajout de la colonne impact_applique pour éviter le double impact sur le solde
-- Date: 2025-01-XX

ALTER TABLE operation_bancaire ADD COLUMN IF NOT EXISTS impact_applique BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN operation_bancaire.impact_applique IS 'Flag pour éviter que l''opération impacte le solde du compte deux fois';
