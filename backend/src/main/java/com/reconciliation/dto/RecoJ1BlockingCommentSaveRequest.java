package com.reconciliation.dto;

public class RecoJ1BlockingCommentSaveRequest {
    private String recoDate;
    private String service;
    private String country;
    private String env;
    private String commentText;

    public String getRecoDate() { return recoDate; }
    public void setRecoDate(String recoDate) { this.recoDate = recoDate; }

    public String getService() { return service; }
    public void setService(String service) { this.service = service; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }

    public String getEnv() { return env; }
    public void setEnv(String env) { this.env = env; }

    public String getCommentText() { return commentText; }
    public void setCommentText(String commentText) { this.commentText = commentText; }
}
