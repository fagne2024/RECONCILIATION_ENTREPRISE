package com.reconciliation.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.warrenstrange.googleauth.GoogleAuthenticator;
import com.warrenstrange.googleauth.GoogleAuthenticatorKey;
import com.warrenstrange.googleauth.GoogleAuthenticatorQRGenerator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * Service pour l'authentification à deux facteurs (2FA) avec Google Authenticator
 */
@Service
public class TwoFactorAuthService {

    private final GoogleAuthenticator gAuth;
    
    @Value("${app.name:Reconciliation App}")
    private String appName;
    
    @Value("${app.host:localhost:8080}")
    private String appHost;

    public TwoFactorAuthService() {
        this.gAuth = new GoogleAuthenticator();
    }

    /**
     * Génère une nouvelle clé secrète pour un utilisateur
     */
    public String generateSecretKey() {
        GoogleAuthenticatorKey key = gAuth.createCredentials();
        return key.getKey();
    }

    /**
     * Génère un code QR au format Base64 pour affichage
     */
    public String generateQRCodeBase64(String username, String secret) {
        String otpAuthUrl = GoogleAuthenticatorQRGenerator.getOtpAuthTotpURL(
                appName,
                username,
                new GoogleAuthenticatorKey.Builder(secret).build()
        );
        
        return generateQRCodeImageBase64(otpAuthUrl);
    }

    /**
     * Génère une image QR Code à partir d'un texte et retourne le Base64
     */
    private String generateQRCodeImageBase64(String text) {
        try {
            int width = 300;
            int height = 300;
            
            Map<EncodeHintType, Object> hints = new HashMap<>();
            hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.H);
            hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
            hints.put(EncodeHintType.MARGIN, 1);
            
            QRCodeWriter qrCodeWriter = new QRCodeWriter();
            BitMatrix bitMatrix = qrCodeWriter.encode(text, BarcodeFormat.QR_CODE, width, height, hints);
            
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            image.createGraphics();
            
            Graphics2D graphics = (Graphics2D) image.getGraphics();
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
            graphics.setColor(Color.BLACK);
            
            for (int i = 0; i < width; i++) {
                for (int j = 0; j < height; j++) {
                    if (bitMatrix.get(i, j)) {
                        graphics.fillRect(i, j, 1, 1);
                    }
                }
            }
            
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(image, "PNG", baos);
            byte[] imageBytes = baos.toByteArray();
            
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(imageBytes);
        } catch (WriterException | IOException e) {
            throw new RuntimeException("Erreur lors de la génération du QR Code", e);
        }
    }

    /**
     * Valide un code TOTP (Time-based One-Time Password)
     */
    public boolean validateCode(String secret, int code) {
        if (secret == null || secret.isEmpty()) {
            return false;
        }
        
        // Valider avec une fenêtre de tolérance de ±1 période (30 secondes)
        // Cela permet de gérer les légers décalages d'horloge
        return gAuth.authorize(secret, code);
    }

    /**
     * Génère l'URL OTP Auth pour l'importation manuelle
     */
    public String generateOtpAuthUrl(String username, String secret) {
        return GoogleAuthenticatorQRGenerator.getOtpAuthTotpURL(
                appName,
                username,
                new GoogleAuthenticatorKey.Builder(secret).build()
        );
    }
}

