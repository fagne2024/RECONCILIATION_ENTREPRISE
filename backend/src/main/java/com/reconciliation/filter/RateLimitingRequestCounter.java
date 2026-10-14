package com.reconciliation.filter;

import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;

/**
 * Compteur de requêtes pour le rate limiting (fenêtre glissante).
 * Classe séparée pour éviter les problèmes de chargement avec Spring DevTools.
 */
class RateLimitingRequestCounter {
    private final ConcurrentLinkedQueue<Long> requests = new ConcurrentLinkedQueue<>();

    public void addRequest(long timestamp) {
        requests.offer(timestamp);
    }

    public void cleanup(long currentTime) {
        long oneHourAgo = currentTime - TimeUnit.HOURS.toMillis(1);
        requests.removeIf(timestamp -> timestamp < oneHourAgo);
    }

    public int getRequestsInLastMinute(long currentTime) {
        long oneMinuteAgo = currentTime - TimeUnit.MINUTES.toMillis(1);
        return (int) requests.stream()
            .filter(timestamp -> timestamp >= oneMinuteAgo)
            .count();
    }

    public int getRequestsInLastHour(long currentTime) {
        long oneHourAgo = currentTime - TimeUnit.HOURS.toMillis(1);
        return (int) requests.stream()
            .filter(timestamp -> timestamp >= oneHourAgo)
            .count();
    }

    public long getResetTimeForMinute(long currentTime) {
        long oneMinuteAgo = currentTime - TimeUnit.MINUTES.toMillis(1);
        Long oldestInMinute = requests.stream()
            .filter(timestamp -> timestamp >= oneMinuteAgo)
            .min(Long::compareTo)
            .orElse(currentTime);
        return oldestInMinute + TimeUnit.MINUTES.toMillis(1);
    }

    public long getResetTimeForHour(long currentTime) {
        long oneHourAgo = currentTime - TimeUnit.HOURS.toMillis(1);
        Long oldestInHour = requests.stream()
            .filter(timestamp -> timestamp >= oneHourAgo)
            .min(Long::compareTo)
            .orElse(currentTime);
        return oldestInHour + TimeUnit.HOURS.toMillis(1);
    }
}
