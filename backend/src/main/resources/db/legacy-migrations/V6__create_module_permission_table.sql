CREATE TABLE module_permission (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    module_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    CONSTRAINT fk_module FOREIGN KEY (module_id) REFERENCES module(id),
    CONSTRAINT fk_permission FOREIGN KEY (permission_id) REFERENCES permission(id)
); 