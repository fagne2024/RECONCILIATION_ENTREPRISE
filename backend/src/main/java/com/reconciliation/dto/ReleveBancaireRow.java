package com.reconciliation.dto;

import java.time.LocalDate;

public class ReleveBancaireRow {
    public String nomCompte;
    public String numeroCompte;
    public String banque; // code propriétaire par défaut
    public LocalDate dateComptable;
    public LocalDate dateValeur;
    public String libelle;
    public Double debit;
    public Double credit;
    public Double montant; // credit - debit (peut être signé pour nivellement)
    public String numeroCheque;
    public String devise;
    public Double soldeCourant;
    public Double soldeDisponibleCloture;
    public Double soldeDisponibleOuverture;
    public Double soldeComptableOuverture;
    public Double soldeComptableCloture;
    public Double depotTotal;
    public Double totalRetraits;
    public String numeroSerie;
}


