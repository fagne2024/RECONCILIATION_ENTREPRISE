package com.reconciliation.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    @Autowired
    private JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String fromEmail;
    
    @Value("${spring.mail.host:}")
    private String mailHost;
    
    @Value("${app.url:http://localhost:4200}")
    private String appUrl;

    public String getLoginUrl() {
        String base = appUrl != null ? appUrl.trim() : "http://localhost:4200";
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/login?returnUrl=%2Freconciliation-launcher";
    }

    public String getResetUrl(String token) {
        String base = appUrl != null ? appUrl.trim() : "http://localhost:4200";
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/reset-password?token=" + token;
    }

    /**
     * URL de la page d'activation d'un compte entreprise (jeton à usage unique).
     */
    public String getActivationUrl(String token) {
        String base = appUrl != null ? appUrl.trim() : "http://localhost:4200";
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base + "/activate?token=" + token;
    }

    /**
     * Envoie un e-mail de contrôle interne BO vs Partenaire (commentaire + accès application).
     */
    public void sendControleInterneCommentEmail(
        String to,
        String subject,
        String body
    ) {
        try {
            if (fromEmail == null || fromEmail.trim().isEmpty()) {
                throw new RuntimeException("La configuration email n'est pas correcte. spring.mail.username est vide.");
            }
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            System.out.println("✅ E-mail contrôle interne envoyé à : " + to);
        } catch (Exception e) {
            System.err.println("❌ Erreur envoi e-mail contrôle interne à " + to + " : " + e.getMessage());
            throw new RuntimeException("Erreur lors de l'envoi de l'e-mail : " + e.getMessage(), e);
        }
    }

    /**
     * Envoie un email avec le mot de passe généré lors de la création d'un utilisateur
     */
    public void sendPasswordEmail(String to, String username, String password) {
        try {
            if (fromEmail == null || fromEmail.trim().isEmpty()) {
                throw new RuntimeException("La configuration email n'est pas correcte. spring.mail.username est vide.");
            }
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(to);
            message.setSubject("Bienvenue - Votre compte a été créé");
            message.setText(String.format(
                "Bonjour %s,\n\n" +
                "Votre compte a été créé avec succès.\n\n" +
                "Voici vos identifiants de connexion :\n" +
                "Nom d'utilisateur : %s\n" +
                "Mot de passe : %s\n\n" +
                "Vous pouvez vous connecter à l'application en suivant ce lien :\n" +
                "%s\n\n" +
                "Nous vous recommandons de changer votre mot de passe après votre première connexion.\n\n" +
                "Cordialement,\n" +
                "L'équipe de réconciliation",
                username, username, password, getLoginUrl()
            ));
            
            mailSender.send(message);
            System.out.println("✅ Email envoyé avec succès à : " + to);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'envoi de l'email à " + to + " : " + e.getMessage());
            throw new RuntimeException("Erreur lors de l'envoi de l'email : " + e.getMessage(), e);
        }
    }

    /**
     * Envoie un email avec le nouveau mot de passe lors d'une réinitialisation administrée
     */
    public void sendPasswordResetEmail(String to, String username, String newPassword) {
        try {
            if (fromEmail == null || fromEmail.trim().isEmpty()) {
                throw new RuntimeException("La configuration email n'est pas correcte. spring.mail.username est vide.");
            }
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(to);
            message.setSubject("Réinitialisation de votre mot de passe");
            message.setText(String.format(
                "Bonjour %s,\n\n" +
                "Votre mot de passe a été réinitialisé par un administrateur.\n\n" +
                "Voici vos nouveaux identifiants de connexion :\n" +
                "Nom d'utilisateur : %s\n" +
                "Nouveau mot de passe : %s\n\n" +
                "Vous pouvez vous connecter à l'application en suivant ce lien :\n" +
                "%s\n\n" +
                "Nous vous recommandons de changer votre mot de passe après votre prochaine connexion.\n\n" +
                "Cordialement,\n" +
                "L'équipe de réconciliation",
                username, username, newPassword, getLoginUrl()
            ));

            mailSender.send(message);
            System.out.println("✅ Email de réinitialisation (admin) envoyé avec succès à : " + to);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'envoi de l'email de réinitialisation à " + to + " : " + e.getMessage());
            throw new RuntimeException("Erreur lors de l'envoi de l'email de réinitialisation : " + e.getMessage(), e);
        }
    }

    /**
     * Envoie le lien d'activation d'un compte entreprise (jeton à usage unique,
     * valable 72 h). Aucun mot de passe n'est transmis : le destinataire choisit
     * lui-même le sien via ce lien.
     */
    public void sendActivationEmail(String to, String username, String activationUrl, String entrepriseNom) {
        try {
            if (fromEmail == null || fromEmail.trim().isEmpty()) {
                throw new RuntimeException("La configuration email n'est pas correcte. spring.mail.username est vide.");
            }
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(to);
            message.setSubject("Activation de votre compte - " + (entrepriseNom != null ? entrepriseNom : "ReconciliApp"));
            message.setText(String.format(
                "Bonjour %s,\n\n" +
                "Un compte administrateur a été créé pour vous%s.\n\n" +
                "Cliquez sur le lien ci-dessous pour choisir votre mot de passe et activer votre compte " +
                "(lien valable 72 heures, à usage unique) :\n" +
                "%s\n\n" +
                "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n" +
                "Cordialement,\n" +
                "L'équipe de réconciliation",
                username,
                (entrepriseNom != null && !entrepriseNom.isBlank() ? " au sein de « " + entrepriseNom + " »" : ""),
                activationUrl
            ));

            mailSender.send(message);
            System.out.println("✅ Email d'activation envoyé avec succès à : " + to);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'envoi de l'email d'activation à " + to + " : " + e.getMessage());
            throw new RuntimeException("Erreur lors de l'envoi de l'email d'activation : " + e.getMessage(), e);
        }
    }

    /**
     * Envoie un email avec un lien de réinitialisation (jeton à usage unique)
     */
    public void sendPasswordResetLinkEmail(String to, String username, String resetUrl) {
        try {
            if (fromEmail == null || fromEmail.trim().isEmpty()) {
                throw new RuntimeException("La configuration email n'est pas correcte. spring.mail.username est vide.");
            }
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(to);
            message.setSubject("Réinitialisation de votre mot de passe");
            message.setText(String.format(
                "Bonjour %s,\n\n" +
                "Une demande de réinitialisation de mot de passe a été faite pour votre compte (%s).\n\n" +
                "Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe (valable 15 minutes) :\n" +
                "%s\n\n" +
                "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste valable.\n\n" +
                "Cordialement,\n" +
                "L'équipe de réconciliation",
                username, username, resetUrl
            ));

            mailSender.send(message);
            System.out.println("✅ Email de réinitialisation (lien) envoyé avec succès à : " + to);
        } catch (Exception e) {
            System.err.println("❌ Erreur lors de l'envoi de l'email de réinitialisation à " + to + " : " + e.getMessage());
            throw new RuntimeException("Erreur lors de l'envoi de l'email de réinitialisation : " + e.getMessage(), e);
        }
    }
}

