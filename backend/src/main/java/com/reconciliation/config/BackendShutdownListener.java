package com.reconciliation.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationFailedEvent;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;

import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Trace la cause des arrets JVM / Spring Boot (console + fichier log + last-shutdown-cause.txt).
 */
@Component
@Slf4j
public class BackendShutdownListener {

    public static final String CAUSE_LOG_PREFIX = "=== CAUSE ARRET BACKEND ===";

    private static volatile boolean hookRegistered;
    private static final AtomicBoolean summaryPrinted = new AtomicBoolean(false);
    private static volatile String lastCause = "ARRET_JVM";
    private static volatile String lastDetail = "Arret du processus Java";

    public BackendShutdownListener() {
        registerShutdownHookOnce();
        registerUncaughtExceptionHandlerOnce();
    }

    static String labelForCause(String cause) {
        return switch (cause) {
            case "ARRET_SPRING" -> "Arret Spring Boot (Ctrl+C ou fermeture terminal)";
            case "ECHEC_DEMARRAGE" -> "Echec au demarrage";
            case "EXCEPTION_NON_GEREE" -> "Exception non geree";
            case "OUT_OF_MEMORY" -> "Memoire insuffisante (OutOfMemoryError)";
            case "ARRET_BRUTAL" -> "Arret brutal (processus tue sans shutdown Spring)";
            default -> "Arret JVM";
        };
    }

    @EventListener
    public void onContextClosed(@NonNull ContextClosedEvent event) {
        recordCause(
                "ARRET_SPRING",
                "Contexte Spring ferme (Ctrl+C, fermeture terminal, ou arret Maven spring-boot:run)"
        );
        printShutdownSummary();
    }

    @EventListener
    public void onApplicationFailed(@NonNull ApplicationFailedEvent event) {
        Throwable ex = event.getException();
        String detail = ex != null
                ? ex.getClass().getSimpleName() + ": " + safeMessage(ex.getMessage())
                : "exception inconnue";
        recordCause("ECHEC_DEMARRAGE", detail);
        printShutdownSummary();
    }

    private static void registerShutdownHookOnce() {
        if (hookRegistered) {
            return;
        }
        synchronized (BackendShutdownListener.class) {
            if (hookRegistered) {
                return;
            }
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                if ("ARRET_JVM".equals(lastCause) && "Arret du processus Java".equals(lastDetail)) {
                    lastDetail = inferJvmShutdownDetail();
                }
                printShutdownSummary();
            }, "backend-shutdown-hook"));
            hookRegistered = true;
        }
    }

    private static void registerUncaughtExceptionHandlerOnce() {
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            String cause = throwable instanceof OutOfMemoryError ? "OUT_OF_MEMORY" : "EXCEPTION_NON_GEREE";
            recordCause(
                    cause,
                    thread.getName() + " — " + throwable.getClass().getSimpleName() + ": " + safeMessage(throwable.getMessage())
            );
            log.error("Exception non geree sur le thread {}", thread.getName(), throwable);
        });
    }

    private static void recordCause(String cause, String detail) {
        lastCause = cause;
        lastDetail = detail;
    }

    private static String inferJvmShutdownDetail() {
        for (StackTraceElement frame : Thread.currentThread().getStackTrace()) {
            String cn = frame.getClassName();
            if (cn.contains("Signal") || cn.contains("Terminator")) {
                return "Signal systeme recu (Ctrl+C ou arret processus externe)";
            }
        }
        return "Hook JVM declenche sans fermeture Spring explicite";
    }

    private static void printShutdownSummary() {
        if (!summaryPrinted.compareAndSet(false, true)) {
            return;
        }
        long pid = ProcessHandle.current().pid();
        String memory = memorySummary();
        String causeLabel = labelForCause(lastCause);
        String line = String.format(
                "%s cause=%s | detail=%s | pid=%d | memoire=%s",
                CAUSE_LOG_PREFIX, lastCause, lastDetail, pid, memory
        );

        log.warn(line);
        log.warn("=== ARRET BACKEND ReconciliApp === cause={} | {} | pid={} | {}",
                causeLabel, lastDetail, pid, memory);

        BackendShutdownCauseFile.record(lastCause, lastDetail + " | " + memory);
    }

    private static String safeMessage(String message) {
        return message != null ? message : "(sans message)";
    }

    private static String memorySummary() {
        MemoryMXBean bean = ManagementFactory.getMemoryMXBean();
        long heapUsedMb = bean.getHeapMemoryUsage().getUsed() / (1024 * 1024);
        long heapMaxMb = bean.getHeapMemoryUsage().getMax() / (1024 * 1024);
        long nonHeapMb = bean.getNonHeapMemoryUsage().getUsed() / (1024 * 1024);
        return String.format("heap=%d/%dMB nonHeap=%dMB", heapUsedMb, heapMaxMb, nonHeapMb);
    }
}
