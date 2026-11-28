package com.reconciliation.dto;

public class ReleveManualDto {

    public String date; // format YYYY-MM-DD
    public String service;
    public String country;
    public String env;

    public Long manualNombre;
    public Double manualVolume;
    public Long rembourseNombre;
    public Double rembourseVolume;
    /** Trx annulé ; null = valeur enregistrée conservée (clients qui ne l'envoient pas). */
    public Long annuleNombre;
    public Double annuleVolume;
}

