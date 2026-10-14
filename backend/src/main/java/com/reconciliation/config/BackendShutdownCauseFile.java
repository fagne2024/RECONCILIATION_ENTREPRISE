package com.reconciliation.config;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Ecrit la cause d'arret dans un fichier synchrone (survit aux arrets brutaux partiels).
 */
public final class BackendShutdownCauseFile {

    private static final Path CAUSE_FILE = Path.of("logs", "last-shutdown-cause.txt");
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final AtomicBoolean shutdownRecorded = new AtomicBoolean(false);
    private static volatile boolean earlyHookRegistered;

    private BackendShutdownCauseFile() {
    }

    public static void markStarted() {
        shutdownRecorded.set(false);
        writeFile("RUNNING", "Backend demarre (java -jar)", false);
    }

    public static void registerEarlyShutdownHook() {
        if (earlyHookRegistered) {
            return;
        }
        synchronized (BackendShutdownCauseFile.class) {
            if (earlyHookRegistered) {
                return;
            }
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                if (!shutdownRecorded.get()) {
                    record("ARRET_JVM", "Hook JVM precoce (signal ou arret processus sans Spring)");
                }
            }, "backend-cause-file-hook"));
            earlyHookRegistered = true;
        }
    }

    public static void record(String cause, String detail) {
        if (!shutdownRecorded.compareAndSet(false, true)) {
            return;
        }
        writeFile(cause, detail, true);
    }

    private static void writeFile(String cause, String detail, boolean mirrorToStdout) {
        long pid = ProcessHandle.current().pid();
        String timestamp = LocalDateTime.now().format(TS);
        String line = String.format(
                "timestamp=%s%ncause=%s%ndetail=%s%npid=%d%n",
                timestamp, cause, detail, pid
        );
        try {
            Files.createDirectories(CAUSE_FILE.getParent());
            Files.writeString(
                    CAUSE_FILE,
                    line,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING,
                    StandardOpenOption.SYNC
            );
        } catch (IOException e) {
            System.err.println("Impossible d'ecrire " + CAUSE_FILE + ": " + e.getMessage());
        }

        if (mirrorToStdout && !"RUNNING".equals(cause)) {
            System.err.println();
            System.err.println("============================================");
            System.err.println("  ARRET BACKEND ReconciliApp");
            System.err.println("  Cause : " + BackendShutdownListener.labelForCause(cause));
            System.err.println("  Detail: " + detail);
            System.err.println("  PID   : " + pid);
            System.err.println("  Fichier: logs/last-shutdown-cause.txt");
            System.err.println("============================================");
            System.err.println();
        }
    }
}
