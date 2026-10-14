package com.reconciliation;

import com.reconciliation.config.BackendShutdownCauseFile;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CsvReconciliationApplication {
    public static void main(String[] args) {
        BackendShutdownCauseFile.markStarted();
        BackendShutdownCauseFile.registerEarlyShutdownHook();
        logProcessContext();
        SpringApplication.run(CsvReconciliationApplication.class, args);
    }

    private static void logProcessContext() {
        long pid = ProcessHandle.current().pid();
        String parent = ProcessHandle.current().parent()
                .map(p -> String.valueOf(p.pid()))
                .orElse("inconnu");
        System.out.printf(
                "=== JVM demarrage pid=%d parent=%s cwd=%s%n",
                pid, parent, System.getProperty("user.dir")
        );
    }
} 