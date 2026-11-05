-- =====================================================================
-- V13 : alignement de la règle « Services TSOP à signe négatif »
--
-- La règle `CERTIF.SERVICES_TSOP_NEGATIFS` est désormais la source de
-- vérité des moteurs de calcul (Configuration > Calcul) : elle est
-- prioritaire, le code conserve sa liste par défaut en repli.
--
-- Le code appliquait historiquement CASHIN, SEND et AIRTIME ; le seed
-- initial ne listait que CASHIN et AIRTIME. On réaligne la valeur par
-- défaut pour que le comportement reste identique à celui d'avant.
--
-- Seule la valeur exactement égale à l'ancien défaut est mise à jour :
-- une liste personnalisée par l'utilisateur est conservée.
-- =====================================================================

UPDATE `calculation_rule`
   SET `valeurs` = '["CASHIN","AIRTIME","SEND"]',
       `date_modification` = CURRENT_TIMESTAMP(6)
 WHERE `code` = 'CERTIF.SERVICES_TSOP_NEGATIFS'
   AND `valeurs` = '["CASHIN","AIRTIME"]';
