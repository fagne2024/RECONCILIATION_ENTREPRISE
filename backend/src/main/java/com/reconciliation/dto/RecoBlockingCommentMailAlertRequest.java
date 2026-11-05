package com.reconciliation.dto;

import java.util.List;

public class RecoBlockingCommentMailAlertRequest {
    private String recoDate;
    private String service;
    private String country;
    private String env;
    private List<String> recipients;
    private List<String> ccRecipients;

    public List<String> getCcRecipients() { return ccRecipients; }
    public void setCcRecipients(List<String> ccRecipients) { this.ccRecipients = ccRecipients; }

    public String getRecoDate() { return recoDate; }
    public void setRecoDate(String recoDate) { this.recoDate = recoDate; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public List<String> getRecipients() { return recipients; }
    public void setRecipients(List<String> recipients) { this.recipients = recipients; }
}
