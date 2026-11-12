-- Colonne pays du relevé bancaire : identifier les comptes / lignes par pays.
-- Code pays (ex. ML, SN, CM). Reprise des lignes existantes : 2 derniers caractères de la banque,
-- uniquement s'ils correspondent à un code pays connu de l'entreprise (même règle que l'ancien filtre).
ALTER TABLE `releve_bancaire`
  ADD COLUMN `pays` VARCHAR(100) NULL,
  ADD INDEX `idx_releve_bancaire_pays` (`pays`);

UPDATE `releve_bancaire` r
  JOIN `pays` p
    ON p.`entreprise_id` = r.`entreprise_id`
   AND UPPER(p.`code`) = UPPER(RIGHT(TRIM(r.`banque`), 2))
   SET r.`pays` = UPPER(p.`code`)
 WHERE r.`pays` IS NULL
   AND r.`banque` IS NOT NULL
   AND CHAR_LENGTH(TRIM(r.`banque`)) >= 2;
