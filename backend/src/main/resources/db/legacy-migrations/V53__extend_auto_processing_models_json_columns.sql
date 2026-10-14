ALTER TABLE auto_processing_models
    MODIFY COLUMN reconciliation_keys MEDIUMTEXT,
    MODIFY COLUMN reconciliation_logic MEDIUMTEXT,
    MODIFY COLUMN correspondence_rules MEDIUMTEXT,
    MODIFY COLUMN comparison_columns MEDIUMTEXT,
    MODIFY COLUMN pre_processing_config MEDIUMTEXT;
