package com.reconciliation.config;

import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
public abstract class AbstractIntegrationTest {

    @Container
    protected static final MySQLContainer<?> MYSQL_CONTAINER = new MySQLContainer<>("mysql:8.0")
        .withDatabaseName("reconciliation_test")
        .withUsername("test")
        .withPassword("test")
        .withCommand("--default-authentication-plugin=mysql_native_password")
        .withReuse(true);

    static {
        MYSQL_CONTAINER.start();
    }
}