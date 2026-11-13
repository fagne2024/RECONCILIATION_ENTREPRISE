package com.reconciliation.dto;

import lombok.Data;

import java.util.List;

/**
 * Demande d'envoi d'une alerte « volume par client » (nombre de transactions anormal sur un numéro).
 * Le sujet et le corps du mail sont générés côté serveur à partir de ces données.
 */
@Data
public class ClientVolumeAlertRequest {

    /** Destinataires (obligatoire, au moins un). */
    private List<String> to;
    /** Destinataires en copie (facultatif). */
    private List<String> cc;

    /** Origine du fichier : « bo » ou « partner ». */
    private String source;
    /** Service sur lequel le calcul est limité (facultatif). */
    private String serviceFilter;
    /** Nom de la colonne téléphone / montant utilisées pour le calcul (informatif). */
    private String phoneColumn;
    private String amountColumn;

    /** Seuils de la règle appliquée. */
    private Integer minOccurrences;
    private Double minVolume;

    /** Nombre de lignes analysées et de numéros distincts (informatif). */
    private Integer analyzedRows;
    private Integer distinctPhones;

    private List<Entry> entries;

    @Data
    public static class Entry {
        private String phone;
        private Integer occurrences;
        private Double volume;
        private List<String> services;
    }
}
