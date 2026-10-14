-- Index fonctionnels pour le contrôle de doublons à l'import OPPART.
--
-- Le service confronte chaque ligne du fichier aux lignes déjà en base. Sans ces
-- index, MySQL parcourt toute la table ; avec eux, il ne lit que les lignes
-- candidates. La normalisation UPPER(TRIM(...)) est indispensable : la collation
-- utf8mb4_0900_ai_ci ignore la casse mais PAS les espaces finaux, que Java
-- supprime dans normalizeForKey(). Sans cette normalisation, une ligne en base
-- dont id_transaction se termine par des espaces passerait entre les mailles.
--
-- À exécuter une seule fois sur une base existante.

CREATE INDEX idx_oppart_idtx_norm ON oppart ((UPPER(TRIM(id_transaction))));

-- Repli du contrôle de doublons pour les lignes sans identifiant de transaction :
-- même client, même jour. MySQL n'exploitant pas une colonne fonctionnelle en tête
-- d'index composite avec un IN, on indexe la plage de dates, qui est la partie
-- sélective de la requête.
CREATE INDEX idx_oppart_date ON oppart (date_operation);

-- Retour arrière :
-- DROP INDEX idx_oppart_idtx_norm ON oppart;
-- DROP INDEX idx_oppart_date ON oppart;
