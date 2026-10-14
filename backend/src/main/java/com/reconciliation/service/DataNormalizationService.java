package com.reconciliation.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class DataNormalizationService {
    
    private static final Logger logger = LoggerFactory.getLogger(DataNormalizationService.class);
    
    // Mapping des colonnes pour la standardisation
    private static final Map<String, String> COLUMN_MAPPING = new HashMap<>();
    
    // Patterns pour la normalisation
    private static final Pattern SPECIAL_CHARS_PATTERN = Pattern.compile("[^\\w\\s-]");
    private static final Pattern MULTIPLE_SPACES_PATTERN = Pattern.compile("\\s+");
    
    static {
        // Mapping des noms de colonnes standardisés
        COLUMN_MAPPING.put("AGENCE", "Agence");
        COLUMN_MAPPING.put("AGENCY", "Agence");
        COLUMN_MAPPING.put("SERVICE", "Service");
        COLUMN_MAPPING.put("DATE", "Date");
        COLUMN_MAPPING.put("VOLUME", "Volume");
        COLUMN_MAPPING.put("TOTAL", "Total");
        COLUMN_MAPPING.put("MONTANT", "Montant");
        COLUMN_MAPPING.put("AMOUNT", "Montant");
        COLUMN_MAPPING.put("PAYS", "Pays");
        COLUMN_MAPPING.put("COUNTRY", "Pays");
        // Ajout pour les fichiers GRX
        COLUMN_MAPPING.put("Pays provenance", "Pays");
        COLUMN_MAPPING.put("PAYS PROVENANCE", "Pays");
        COLUMN_MAPPING.put("paysProvenance", "Pays");
        COLUMN_MAPPING.put("TELEPHONE", "Téléphone");
        COLUMN_MAPPING.put("PHONE", "Téléphone");
        COLUMN_MAPPING.put("NUMERO", "Numéro");
        COLUMN_MAPPING.put("NUMBER", "Numéro");
        COLUMN_MAPPING.put("REFERENCE", "Référence");
        COLUMN_MAPPING.put("REF", "Référence");
        COLUMN_MAPPING.put("ID", "ID");
        COLUMN_MAPPING.put("IDENTIFIANT", "ID");
        COLUMN_MAPPING.put("IDENTIFIER", "ID");
        COLUMN_MAPPING.put("TRANSACTION", "Transaction");
        COLUMN_MAPPING.put("TRANS", "Transaction");
        COLUMN_MAPPING.put("OPERATION", "Opération");
        COLUMN_MAPPING.put("OP", "Opération");
        COLUMN_MAPPING.put("TYPE", "Type");
        COLUMN_MAPPING.put("STATUT", "Statut");
        COLUMN_MAPPING.put("STATUS", "Statut");
        COLUMN_MAPPING.put("CANAL", "Canal");
        COLUMN_MAPPING.put("CHANNEL", "Canal");
        COLUMN_MAPPING.put("DISTRIBUTION", "Distribution");
        COLUMN_MAPPING.put("DIST", "Distribution");
        COLUMN_MAPPING.put("AGENT", "Agent");
        COLUMN_MAPPING.put("BENEFICIAIRE", "Bénéficiaire");
        COLUMN_MAPPING.put("BENEFICIARY", "Bénéficiaire");
        COLUMN_MAPPING.put("EXPEDITEUR", "Expéditeur");
        COLUMN_MAPPING.put("SENDER", "Expéditeur");
        COLUMN_MAPPING.put("MOYEN", "Moyen");
        COLUMN_MAPPING.put("MEAN", "Moyen");
        COLUMN_MAPPING.put("PAIEMENT", "Paiement");
        COLUMN_MAPPING.put("PAYMENT", "Paiement");
        COLUMN_MAPPING.put("PROVENANCE", "Provenance");
        COLUMN_MAPPING.put("ORIGIN", "Provenance");
        COLUMN_MAPPING.put("LATITUDE", "Latitude");
        COLUMN_MAPPING.put("LAT", "Latitude");
        COLUMN_MAPPING.put("LONGITUDE", "Longitude");
        COLUMN_MAPPING.put("LONG", "Longitude");
        COLUMN_MAPPING.put("PARTENAIRE", "Partenaire");
        COLUMN_MAPPING.put("PARTNER", "Partenaire");
        COLUMN_MAPPING.put("PIXI", "PIXI");
        COLUMN_MAPPING.put("GRX", "GRX");
        COLUMN_MAPPING.put("CLIENT", "Client");
        COLUMN_MAPPING.put("CUSTOMER", "Client");
        COLUMN_MAPPING.put("COMPTE", "Compte");
        COLUMN_MAPPING.put("ACCOUNT", "Compte");
        COLUMN_MAPPING.put("PSEUDO", "Pseudo");
        COLUMN_MAPPING.put("PSEUDONYM", "Pseudo");
        COLUMN_MAPPING.put("COMMISSIONS", "Commissions");
        COLUMN_MAPPING.put("FEES", "Commissions");
        COLUMN_MAPPING.put("XAF", "XAF");
        COLUMN_MAPPING.put("FCFA", "XAF");
        COLUMN_MAPPING.put("HEURE", "Heure");
        COLUMN_MAPPING.put("TIME", "Heure");
        COLUMN_MAPPING.put("SOLDE", "Solde");
        COLUMN_MAPPING.put("BALANCE", "Solde");
        COLUMN_MAPPING.put("APRES", "Après");
        COLUMN_MAPPING.put("AFTER", "Après");
        COLUMN_MAPPING.put("PROPRIETAIRE", "Propriétaire");
        COLUMN_MAPPING.put("OWNER", "Propriétaire");
        COLUMN_MAPPING.put("RESEAU", "Réseau");
        COLUMN_MAPPING.put("NETWORK", "Réseau");
        COLUMN_MAPPING.put("MOTIF", "Motif");
        COLUMN_MAPPING.put("REASON", "Motif");
        COLUMN_MAPPING.put("REGULARISATION", "Régularisation");
        COLUMN_MAPPING.put("REGULARIZATION", "Régularisation");
        COLUMN_MAPPING.put("GROUPE", "Groupe");
        COLUMN_MAPPING.put("GROUP", "Groupe");
        COLUMN_MAPPING.put("CODE", "Code");
        COLUMN_MAPPING.put("LOGIN", "Login");
        COLUMN_MAPPING.put("DEMANDEUR", "Demandeur");
        COLUMN_MAPPING.put("REQUESTER", "Demandeur");
        COLUMN_MAPPING.put("APPRO", "Appro");
        COLUMN_MAPPING.put("APPROVAL", "Appro");
        COLUMN_MAPPING.put("VALIDEUR", "Valideur");
        COLUMN_MAPPING.put("VALIDATOR", "Valideur");
        COLUMN_MAPPING.put("REJET", "Rejet");
        COLUMN_MAPPING.put("REJECTION", "Rejet");
        COLUMN_MAPPING.put("FRAIS", "Frais");
        COLUMN_MAPPING.put("FEES", "Frais");
        COLUMN_MAPPING.put("CONNEXION", "Connexion");
        COLUMN_MAPPING.put("CONNECTION", "Connexion");
        COLUMN_MAPPING.put("ENVOI", "Envoi");
        COLUMN_MAPPING.put("SENDING", "Envoi");
        COLUMN_MAPPING.put("ACTION", "Action");
        COLUMN_MAPPING.put("FAITE", "Faite");
        COLUMN_MAPPING.put("DONE", "Faite");
        COLUMN_MAPPING.put("DIST", "Dist");
        COLUMN_MAPPING.put("SC", "SC");
        COLUMN_MAPPING.put("PDA", "PDA");
        COLUMN_MAPPING.put("DERNIER", "Dernier");
        COLUMN_MAPPING.put("LAST", "Dernier");
        COLUMN_MAPPING.put("TRAITEMENT", "Traitement");
        COLUMN_MAPPING.put("PROCESSING", "Traitement");
        COLUMN_MAPPING.put("CREATION", "Création");
        COLUMN_MAPPING.put("CREATION", "Création");
        COLUMN_MAPPING.put("DESTINATAIRE", "Destinataire");
        COLUMN_MAPPING.put("RECIPIENT", "Destinataire");
    }
}



