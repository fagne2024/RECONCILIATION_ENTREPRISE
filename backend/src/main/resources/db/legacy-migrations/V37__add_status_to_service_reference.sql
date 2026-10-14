ALTER TABLE service_reference
ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIF';

UPDATE service_reference
SET status = COALESCE(NULLIF(status, ''), 'ACTIF');

