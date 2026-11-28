-- Type de décalage d'une ligne du Résumé écarts BO, choisi à l'enregistrement :
-- JM1_BO, JM1_PARTENAIRE, JP1_BO, JP1_PARTENAIRE (la ligne est datée du jour du rapport concerné).
-- NULL = écart simple (anciennes lignes Partenaire : J+1 / J-1 déduits de la date, comme avant).
ALTER TABLE `ecart_bo_summary` ADD COLUMN `type_decalage` VARCHAR(20) NULL;
