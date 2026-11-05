-- =====================================================================
-- V18 : personnes en copie (Cc) de la relance e-mail d'un commentaire
--       de blocage (adresses séparées par des virgules).
-- =====================================================================

ALTER TABLE `reco_blocking_comment_mail_alert`
  ADD COLUMN `cc_recipients` VARCHAR(2000) NULL AFTER `recipients`;
