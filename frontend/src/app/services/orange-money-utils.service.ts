import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class OrangeMoneyUtilsService {

  constructor() { }

  /**
   * Normalise un libellé de colonne pour comparaison (casse, accents, espaces).
   */
  normalizeColumnLabel(column?: string | null): string {
    return String(column ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /** Colonne Statut Orange Money (y compris en-tête « Généré le : »). */
  matchesOrangeMoneyStatutColumn(column?: string | null): boolean {
    const label = this.normalizeColumnLabel(column);
    return label.includes('statut')
      || label.includes('status')
      || label.includes('etat')
      || label.includes('state')
      || label.includes('genere le');
  }

  /** Colonne Paiement Orange Money (y compris en-tête « Application : »). */
  matchesOrangeMoneyPaiementColumn(column?: string | null): boolean {
    const label = this.normalizeColumnLabel(column);
    return label.includes('paiement')
      || label.includes('payment')
      || label.includes('moyen de paiement')
      || label.includes('moyen paiement')
      || label.startsWith('application :')
      || label.startsWith('application:')
      || label === 'application';
  }

  /**
   * Règle métier : tout modèle dont le pattern contient « OM » est Orange Money
   * (ex. *CIOMCM*, *PMOMCI*, *OMBF*).
   */
  isOrangeMoneyModelPattern(filePattern?: string | null): boolean {
    const pattern = String(filePattern || '').trim();
    if (!pattern) {
      return false;
    }
    return pattern.toUpperCase().includes('OM');
  }

  isOrangeMoneyModel(
    model?: {
      filePattern?: string | null;
      name?: string | null;
      id?: string | null;
      modelId?: string | null;
    } | null
  ): boolean {
    if (!model) {
      return false;
    }
    if (this.isOrangeMoneyModelPattern(model.filePattern)) {
      return true;
    }
    const name = String(model.name || '').toLowerCase();
    const id = String(model.id || model.modelId || '').toLowerCase();
    return name.includes('orange') || name.includes('ciom') || name.includes('pmom')
      || id.includes('orange') || id.includes('ciom') || id.includes('pmom');
  }

  shouldApplyOrangeMoneyTreatment(
    fileName?: string | null,
    model?: {
      filePattern?: string | null;
      name?: string | null;
      id?: string | null;
      modelId?: string | null;
    } | null
  ): boolean {
    if (model && this.isOrangeMoneyModel(model)) {
      return true;
    }
    return !!fileName && this.isOrangeMoneyFile(fileName);
  }

  /**
   * Détecte si un fichier est un fichier Orange Money
   */
  isOrangeMoneyFile(fileName: string, filePattern?: string | null): boolean {
    if (this.isOrangeMoneyModelPattern(filePattern)) {
      return true;
    }

    const fileNameLower = fileName.toLowerCase();
    
    const hasCiomcm = fileNameLower.includes('ciomcm');
    const hasOrange = fileNameLower.includes('orange');
    const hasOrangeMoney = fileNameLower.includes('orange money');
    
    // Détecter les patterns CIOM et PMOM suivis de codes de pays
    const ciomPattern = /ciom\d{2}/i;
    const pmomPattern = /pmom\d{2}/i;
    const ciomCountryPattern = /ciom(cm|ml|gn|ci|sn|kn|bj|gb)/i;
    const pmomCountryPattern = /pmom(cm|ml|gn|ci|sn|kn|bj|gb)/i;
    const hasCiomPattern = ciomPattern.test(fileName);
    const hasPmomPattern = pmomPattern.test(fileName);
    const hasCiomCountryPattern = ciomCountryPattern.test(fileName);
    const hasPmomCountryPattern = pmomCountryPattern.test(fileName);
    
    
    const result = hasCiomcm || hasOrange || hasOrangeMoney || hasCiomPattern || hasPmomPattern || hasCiomCountryPattern || hasPmomCountryPattern;
    
    return result;
  }

  /**
   * Retourne les valeurs spécifiques pour un champ donné dans un fichier Orange Money
   */
  getOrangeMoneyFieldValues(fieldName: string): string[] {
    if (this.matchesOrangeMoneyStatutColumn(fieldName)) {
      return ['Succès'];
    }
    
    if (this.normalizeColumnLabel(fieldName).includes('service')) {
      return ['Cash in', 'Débit'];
    }

    if (this.matchesOrangeMoneyPaiementColumn(fieldName)) {
      return ['Débit', 'Crédit', 'Transfert', 'Paiement'];
    }
    
    // Pour tous les autres champs, retourner un tableau vide
    return [];
  }

  /**
   * Retourne les valeurs mockées par défaut pour un champ donné
   */
  getMockColumnValues(columnName: string): string[] {
    
    const mockData: { [key: string]: string[] } = {
      // Colonnes d'agence
      'Code_Agence': ['AG001', 'AG002', 'AG003', 'AG004', 'AG005'],
      'Nom_Agence': ['Agence Centrale', 'Agence Nord', 'Agence Sud', 'Agence Est', 'Agence Ouest'],
      
      // Colonnes de transaction
      'Code_Transaction': ['TRX001', 'TRX002', 'TRX003', 'TRX004', 'TRX005'],
      'Type_Transaction': ['VENTE', 'ACHAT', 'REMBOURSEMENT', 'VIREMENT', 'PAIEMENT'],
      'Montant': ['1000.00', '2500.50', '500.25', '1500.75', '3000.00'],
      
      // Colonnes de client
      'Code_Client': ['CLI001', 'CLI002', 'CLI003', 'CLI004', 'CLI005'],
      'Nom_Client': ['Dupont', 'Martin', 'Bernard', 'Petit', 'Robert'],
      'Prenom_Client': ['Jean', 'Marie', 'Pierre', 'Sophie', 'Paul'],
      
      // Colonnes de compte
      'Code_Compte': ['ACC001', 'ACC002', 'ACC003', 'ACC004', 'ACC005'],
      'Type_Compte': ['COURANT', 'EPARGNE', 'TERME', 'INVESTISSEMENT'],
      'Solde': ['5000.00', '12000.50', '2500.25', '8000.75', '15000.00'],
      
      // Colonnes génériques
      'Statut': ['ACTIF', 'INACTIF', 'EN_ATTENTE', 'BLOQUE'],
      'Devise': ['EUR', 'USD', 'GBP', 'JPY', 'CHF'],
      'Categorie': ['ALIMENTATION', 'TRANSPORT', 'LOISIRS', 'SANTE', 'EDUCATION'],
      'Region': ['NORD', 'SUD', 'EST', 'OUEST', 'CENTRE'],
      'Departement': ['FINANCE', 'RH', 'IT', 'MARKETING', 'VENTES'],
      'Niveau': ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE', 'EXPERT'],
      'Priorite': ['BASSE', 'MOYENNE', 'HAUTE', 'URGENTE'],
      'Statut_Paiement': ['EN_ATTENTE', 'PAYE', 'REFUSE', 'ANNULE'],
      
      // Colonnes d'adresse
      'Adresse': ['123 Rue de la Paix', '456 Avenue des Champs', '789 Boulevard Central'],
      'Ville': ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'],
      'Code_Postal': ['75001', '69001', '13001', '31000', '06000'],
      
      // Colonnes de contact
      'Telephone': ['01.23.45.67.89', '04.78.90.12.34', '05.61.23.45.67'],
      'Email': ['contact@agence.fr', 'info@banque.com', 'service@finance.net'],
      
      // Colonnes de description
      'Description': ['Transaction standard', 'Paiement en ligne', 'Virement interbancaire', 'Remboursement'],
      
      // Colonnes de date
      'Date_Transaction': ['2025-01-15', '2025-01-16', '2025-01-17', '2025-01-18'],
      'Date_Ouverture': ['2020-01-01', '2021-03-15', '2022-06-20', '2023-09-10'],
      
      // Colonnes Orange Money
      'N°': ['1', '2', '3', '4', '5'],
      'Heure': ['09:30', '10:15', '11:45', '14:20', '16:30'],
      'Référence': ['REF001', 'REF002', 'REF003', 'REF004', 'REF005'],
      'Service': ['Orange Money', 'Transfert', 'Paiement', 'Recharge'],
      'Paiement': ['Débit', 'Crédit', 'Transfert', 'Paiement'],
      'Mode': ['Mobile', 'Web', 'SMS', 'USSD'],
      'N° de Compte': ['656250168', '693511313', '41052831'],
      'Wallet': ['Orange Money', 'Mobile Money', 'E-Wallet'],
      'N° Pseudo': ['USER001', 'USER002', 'USER003'],
      'Débit': ['1000', '2500', '500', '1500'],
      'Crédit': ['5000', '12000', '2500', '8000'],
      'Compte: 656250168': ['656250168'],
      'Sous-réseau': ['Réseau 1', 'Réseau 2', 'Réseau 3'],
      
      // Colonnes génériques pour les noms de colonnes courants
      'date': ['2025-01-15', '2025-01-16', '2025-01-17', '2025-01-18'],
      'montant': ['1000.00', '2500.50', '500.25', '1500.75', '3000.00'],
      'description': ['Transaction standard', 'Paiement en ligne', 'Virement interbancaire'],
      'reference': ['REF001', 'REF002', 'REF003', 'REF004', 'REF005'],
      'type': ['VENTE', 'ACHAT', 'REMBOURSEMENT', 'VIREMENT', 'PAIEMENT'],
      'code': ['CODE001', 'CODE002', 'CODE003', 'CODE004', 'CODE005'],
      'nom': ['Dupont', 'Martin', 'Bernard', 'Petit', 'Robert'],
      'prenom': ['Jean', 'Marie', 'Pierre', 'Sophie', 'Paul'],
      'ville': ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'],
      'adresse': ['123 Rue de la Paix', '456 Avenue des Champs', '789 Boulevard Central'],
      'telephone': ['01.23.45.67.89', '04.78.90.12.34', '05.61.23.45.67'],
      'email': ['contact@agence.fr', 'info@banque.com', 'service@finance.net']
    };

    // Rechercher une correspondance exacte
    if (mockData[columnName]) {
      return mockData[columnName];
    }

    // Rechercher une correspondance partielle (insensible à la casse)
    const columnNameLower = columnName.toLowerCase();
    for (const [key, values] of Object.entries(mockData)) {
      if (key.toLowerCase().includes(columnNameLower) || columnNameLower.includes(key.toLowerCase())) {
        return values;
      }
    }

    // Valeurs génériques par défaut
    return ['Valeur1', 'Valeur2', 'Valeur3', 'Valeur4', 'Valeur5'];
  }

  /**
   * Retourne les valeurs appropriées pour un champ donné, en tenant compte du type de fichier
   */
  getFieldValues(fieldName: string, fileName?: string): string[] {
    // Si c'est un fichier Orange Money, utiliser les valeurs spécifiques
    if (fileName && this.isOrangeMoneyFile(fileName)) {
      const orangeMoneyValues = this.getOrangeMoneyFieldValues(fieldName);
      if (orangeMoneyValues.length > 0) {
        return orangeMoneyValues;
      }
    }
    
    // Sinon, utiliser les valeurs mockées par défaut
    return this.getMockColumnValues(fieldName);
  }
} 