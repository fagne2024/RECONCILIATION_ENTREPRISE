package com.reconciliation.dto;

import java.util.List;

public class RecoJ1BlockingCommentDto {
    private String recoDate;
    private String service;
    private String country;
    private String env;
    private String commentText;
    private String updatedBy;
    private String updatedAt;

    /** Relance e-mail quotidienne (null si aucune relance n'a jamais été activée). */
    private Boolean mailAlertActive;
    private List<String> mailRecipients;
    private List<String> mailCcRecipients;

    public List<String> getMailCcRecipients() { return mailCcRecipients; }
    public void setMailCcRecipients(List<String> mailCcRecipients) { this.mailCcRecipients = mailCcRecipients; }
    private String mailLastSentAt;
    private Integer mailSendCount;
    private String mailLastError;
    private String mailStoppedReason;

    public Boolean getMailAlertActive() { return mailAlertActive; }
    public void setMailAlertActive(Boolean mailAlertActive) { this.mailAlertActive = mailAlertActive; }

    public List<String> getMailRecipients() { return mailRecipients; }
    public void setMailRecipients(List<String> mailRecipients) { this.mailRecipients = mailRecipients; }

    public String getMailLastSentAt() { return mailLastSentAt; }
    public void setMailLastSentAt(String mailLastSentAt) { this.mailLastSentAt = mailLastSentAt; }

    public Integer getMailSendCount() { return mailSendCount; }
    public void setMailSendCount(Integer mailSendCount) { this.mailSendCount = mailSendCount; }

    public String getMailLastError() { return mailLastError; }
    public void setMailLastError(String mailLastError) { this.mailLastError = mailLastError; }

    public String getMailStoppedReason() { return mailStoppedReason; }
    public void setMailStoppedReason(String mailStoppedReason) { this.mailStoppedReason = mailStoppedReason; }

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

    public String getUpdatedBy() { return updatedBy; }
    public void setUpdatedBy(String updatedBy) { this.updatedBy = updatedBy; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
