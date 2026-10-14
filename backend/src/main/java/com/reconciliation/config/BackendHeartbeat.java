package com.reconciliation.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Heartbeat disque pour tracer la mort brutale du JVM (sans hook d'arret).
 */
@Component
@Slf4j
public class BackendHeartbeat {

    private static final Path HEARTBEAT_FILE = Path.of("logs", "backend-heartbeat.txt");
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Scheduled(fixedRate = 30_000)
    public void beat() {
        long pid = ProcessHandle.current().pid();
        MemoryMXBean mem = ManagementFactory.getMemoryMXBean();
        long heapUsed = mem.getHeapMemoryUsage().getUsed() / (1024 * 1024);
        long heapMax = mem.getHeapMemoryUsage().getMax() / (1024 * 1024);
        long metaspaceUsed = mem.getNonHeapMemoryUsage().getUsed() / (1024 * 1024);

        String line = String.format(
                "%s pid=%d heap=%d/%dMB metaspace=%dMB threads=%d%n",
                LocalDateTime.now().format(TS),
                pid,
                heapUsed,
                heapMax,
                metaspaceUsed,
                Thread.activeCount()
        );

        try {
            Files.createDirectories(HEARTBEAT_FILE.getParent());
            Files.writeString(
                    HEARTBEAT_FILE,
                    line,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING,
                    StandardOpenOption.SYNC
            );
        } catch (IOException e) {
            log.debug("Heartbeat non ecrit: {}", e.getMessage());
        }
    }
}
