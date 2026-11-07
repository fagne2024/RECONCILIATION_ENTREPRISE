-- =====================================================================
-- V27 : marque les opérations bancaires dont la correspondance a été
-- validée par le check (banque et référence reportées depuis le suivi
-- compense OP). Ces lignes ne sont plus proposées aux checks suivants.
-- =====================================================================

ALTER TABLE `operation_bancaire`
  ADD COLUMN `check_valide` BOOLEAN NOT NULL DEFAULT FALSE;
