package com.reconciliation.model;

/**
 * Mise à jour en lot du statut / token / env des liaisons BO–Partenaire.
 */
public class EcartBoSummaryStatusLinkUpdateDTO {
    private Long id;
    private String statut;
    private String token;
    private String env;
    private String envCode;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getStatut() {
        return statut;
    }

    public void setStatut(String statut) {
        this.statut = statut;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getEnv() {
        return env;
    }

    public void setEnv(String env) {
        this.env = env;
    }

    public String getEnvCode() {
        return envCode;
    }

    public void setEnvCode(String envCode) {
        this.envCode = envCode;
    }
}
