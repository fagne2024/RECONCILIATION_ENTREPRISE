-- Tag « modèle banque » sur les modèles de traitement automatique.
-- Sur ces modèles, les clés de réconciliation (clé partenaire / clé BO) sont optionnelles.
ALTER TABLE `auto_processing_models`
  ADD COLUMN `bank_model` TINYINT(1) NOT NULL DEFAULT 0;
