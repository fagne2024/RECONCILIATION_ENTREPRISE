import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PaysService } from '../../services/pays.service';
import { ProfilService } from '../../services/profil.service';
import { NiveauxValidationConfigService, NiveauTraitementConfig, NiveauxValidationConfig } from '../../services/niveaux-validation-config.service';
import { Pays } from '../../models/pays.model';
import { Profil } from '../../models/profil.model';

type ToastType = 'success' | 'error' | 'info' | 'warning';

@Component({
  selector: 'app-niveaux-validation-reco',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './niveaux-validation-reco.component.html',
  styleUrls: ['./niveaux-validation-reco.component.scss']
})
export class NiveauxValidationRecoComponent implements OnInit, OnDestroy {
  paysList: Pays[] = [];
  selectedPaysCode: string = 'GNL';

  profilsDisponibles: Profil[] = [];

  niveauTraitementSuggestions = [
    'Niveau Support', 'Responsable CDO', 'Niveau GROUP', 'Terminé'
  ];
  statutSuggestions = [
    'EN_COURS_TRAITEMENT', 'EN_COURS_VALIDATION', 'EN_COURS_CLOTURE', 'TERMINE', 'VALIDÉ', 'REJETÉ', 'EN_ATTENTE'
  ];

  // Configuration locale (synchrone pour le formulaire)
  configLocale: NiveauxValidationConfig = { niveauxTraitement: [] };

  // Saisie texte des emails (TO / CC) du niveau en cours d'édition
  niveauEmailsDestinatairesInput = '';
  niveauEmailsCopieInput = '';

  nouvelNiveau = {
    valeur: '',
    ordre: 0,
    actif: true,
    description: '',
    statutAssocie: '',
    profilsAutorisesIds: [] as number[],
    destinatairesEmail: [] as string[],
    copieEmail: [] as string[],
    envoiAutomatiqueEmail: false
  };
  editIndex: number | null = null;
  isEditingNiveau = false;

  showAddPaysModal = false;
  nouveauPays: Pays = { code: '', nom: '' };
  addPaysError = '';
  addingPays = false;
  private readonly codePaysPattern = /^[A-Z0-9_-]{2,10}$/;

  toastMessage: string = '';
  toastType: ToastType = 'success';
  private toastTimeout: any;

  constructor(
    private paysService: PaysService, 
    private profilService: ProfilService,
    private configService: NiveauxValidationConfigService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.chargerPays();
    this.chargerProfils();
    this.chargerConfigDepuisService();
  }

  ngOnDestroy(): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  chargerPays(selectCode?: string): void {
    this.paysService.getPays().subscribe({
      next: (pays) => {
        this.paysList = pays;
        if (!this.paysList.find(p => p.code === 'GNL')) {
          this.paysList.unshift({ code: 'GNL', nom: 'GNL (Tous les pays)' });
        }
        if (selectCode && this.paysList.some(p => p.code === selectCode)) {
          this.selectedPaysCode = selectCode;
          this.onPaysChange();
        }
      },
      error: (err) => {
        console.error('Erreur chargement pays:', err);
        this.paysList = [{ code: 'GNL', nom: 'GNL (Tous les pays)' }];
      }
    });
  }

  // --- Ajout d'un pays ---
  ouvrirAjoutPays(): void {
    this.nouveauPays = { code: '', nom: '' };
    this.addPaysError = '';
    this.showAddPaysModal = true;
  }

  fermerAjoutPays(): void {
    if (this.addingPays) return;
    this.showAddPaysModal = false;
  }

  onCodePaysInput(value: string): void {
    this.nouveauPays.code = (value || '').toUpperCase().replace(/\s+/g, '');
    this.addPaysError = '';
  }

  get canAjouterPays(): boolean {
    return this.codePaysPattern.test(this.nouveauPays.code)
      && !!this.nouveauPays.nom.trim()
      && !this.addingPays;
  }

  ajouterPays(): void {
    if (!this.canAjouterPays) return;
    const code = this.nouveauPays.code;
    if (this.paysList.some(p => p.code.toUpperCase() === code)) {
      this.addPaysError = this.translate.instant('NIVEAUX.PAYS_EXISTE_DEJA', { code });
      return;
    }
    this.addingPays = true;
    this.addPaysError = '';
    this.paysService.createPays({ code, nom: this.nouveauPays.nom.trim() }).subscribe({
      next: (created) => {
        this.addingPays = false;
        this.showAddPaysModal = false;
        this.showToast(this.translate.instant('NIVEAUX.PAYS_AJOUTE', { code: created.code }));
        this.chargerPays(created.code);
      },
      error: (err) => {
        this.addingPays = false;
        this.addPaysError = err?.error?.message || this.translate.instant('NIVEAUX.ERREUR_AJOUT_PAYS');
      }
    });
  }

  chargerProfils(): void {
    this.profilService.getProfils().subscribe({
      next: (profils) => {
        this.profilsDisponibles = profils;
      },
      error: (err) => {
        console.error('Erreur chargement profils:', err);
        this.profilsDisponibles = [];
      }
    });
  }

  chargerConfigDepuisService(): void {
    // Charger depuis le service (localStorage ou API)
    this.configLocale = this.normaliserConfig(this.configService.getConfigForPaysSync(this.selectedPaysCode));
  }

  private normaliserConfig(config: NiveauxValidationConfig): NiveauxValidationConfig {
    return {
      ...config,
      niveauxTraitement: (config.niveauxTraitement || []).map(niveau => ({
        ...niveau,
        profilsAutorisesIds: niveau.profilsAutorisesIds || [],
        destinatairesEmail: niveau.destinatairesEmail || [],
        copieEmail: niveau.copieEmail || [],
        envoiAutomatiqueEmail: niveau.envoiAutomatiqueEmail === true
      }))
    };
  }

  chargerConfigParDefaut(): void {
    const defaut: NiveauxValidationConfig = {
      niveauxTraitement: [
        { valeur: 'Niveau Support', ordre: 1, actif: true, description: 'Premier niveau de traitement - Support', statutAssocie: 'EN_COURS_TRAITEMENT', profilsAutorisesIds: [], destinatairesEmail: [], copieEmail: [], envoiAutomatiqueEmail: false },
        { valeur: 'Responsable CDO', ordre: 2, actif: true, description: 'Validation par le Responsable CDO', statutAssocie: 'EN_COURS_VALIDATION', profilsAutorisesIds: [], destinatairesEmail: [], copieEmail: [], envoiAutomatiqueEmail: false },
        { valeur: 'Niveau GROUP', ordre: 3, actif: true, description: 'Validation au niveau GROUP', statutAssocie: 'EN_COURS_CLOTURE', profilsAutorisesIds: [], destinatairesEmail: [], copieEmail: [], envoiAutomatiqueEmail: false },
        { valeur: 'Terminé', ordre: 4, actif: true, description: 'Traitement complètement terminé', statutAssocie: 'TERMINE', profilsAutorisesIds: [], destinatairesEmail: [], copieEmail: [], envoiAutomatiqueEmail: false }
      ]
    };
    this.configLocale = defaut;
    this.sauvegarderDansService();
  }

  onPaysChange(): void {
    this.chargerConfigDepuisService();
    this.resetForm();
  }

  get niveauxTraitement() {
    return this.configLocale.niveauxTraitement;
  }

  get selectedPaysLabel(): string {
    if (this.selectedPaysCode === 'GNL') return 'GNL (Tous les pays)';
    const p = this.paysList.find(p => p.code === this.selectedPaysCode);
    return p ? p.nom : this.selectedPaysCode;
  }

  isGNL(): boolean {
    return this.selectedPaysCode === 'GNL';
  }

  getProfilNom(profilId: number): string {
    const profil = this.profilsDisponibles.find(p => p.id === profilId);
    return profil ? profil.nom : `Profil #${profilId}`;
  }

  private showToast(message: string, type: ToastType = 'success'): void {
    this.toastMessage = message;
    this.toastType = type;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = '';
    }, 3000);
  }

  private sauvegarderDansService(): void {
    this.configService.setConfigForPays(this.selectedPaysCode, this.configLocale);
    this.showToast(`Configuration sauvée pour ${this.selectedPaysLabel}`);
  }

  /** Normalise une liste d'emails saisie en texte (séparateurs : virgule, point-virgule, espace). */
  private parseEmails(value: string): string[] {
    const seen = new Set<string>();
    return (value || '')
      .split(/[,;\s]+/)
      .map(email => email.trim())
      .filter(email => !!email && email.includes('@'))
      .filter(email => {
        const lower = email.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
  }

  /** Reporte les emails saisis dans le formulaire vers le niveau en cours. */
  private syncNiveauFormEmails(): void {
    this.nouvelNiveau.destinatairesEmail = this.parseEmails(this.niveauEmailsDestinatairesInput);
    this.nouvelNiveau.copieEmail = this.parseEmails(this.niveauEmailsCopieInput);
  }

  // --- Niveaux de traitement ---
  sauvegarderNiveau(): void {
    if (!this.nouvelNiveau.valeur.trim()) return;

    this.syncNiveauFormEmails();
    const dataToSave: NiveauTraitementConfig = { 
      ...this.nouvelNiveau, 
      profilsAutorisesIds: [...this.nouvelNiveau.profilsAutorisesIds],
      destinatairesEmail: [...(this.nouvelNiveau.destinatairesEmail || [])],
      copieEmail: [...(this.nouvelNiveau.copieEmail || [])]
    };
    
    if (this.isEditingNiveau && this.editIndex !== null) {
      this.configLocale.niveauxTraitement[this.editIndex] = dataToSave;
      this.showToast('Niveau de traitement modifié');
    } else {
      this.configLocale.niveauxTraitement.push(dataToSave);
      this.showToast('Niveau de traitement ajouté');
    }
    this.sauvegarderDansService();
    this.resetForm();
  }

  editerNiveau(index: number): void {
    const niveau = this.configLocale.niveauxTraitement[index];
    this.nouvelNiveau = { 
      valeur: niveau.valeur, 
      ordre: niveau.ordre, 
      actif: niveau.actif, 
      description: niveau.description, 
      statutAssocie: niveau.statutAssocie, 
      profilsAutorisesIds: [...niveau.profilsAutorisesIds],
      destinatairesEmail: [...(niveau.destinatairesEmail || [])],
      copieEmail: [...(niveau.copieEmail || [])],
      envoiAutomatiqueEmail: niveau.envoiAutomatiqueEmail === true
    };
    this.niveauEmailsDestinatairesInput = (niveau.destinatairesEmail || []).join(', ');
    this.niveauEmailsCopieInput = (niveau.copieEmail || []).join(', ');
    this.editIndex = index;
    this.isEditingNiveau = true;
  }

  supprimerNiveau(index: number): void {
    if (confirm('Supprimer ce niveau de traitement ?')) {
      this.configLocale.niveauxTraitement.splice(index, 1);
      this.sauvegarderDansService();
      this.showToast('Niveau de traitement supprimé', 'info');
    }
  }

  resetForm(): void {
    this.nouvelNiveau = {
      valeur: '',
      ordre: this.configLocale.niveauxTraitement.length + 1,
      actif: true,
      description: '',
      statutAssocie: '',
      profilsAutorisesIds: [],
      destinatairesEmail: [],
      copieEmail: [],
      envoiAutomatiqueEmail: false
    };
    this.niveauEmailsDestinatairesInput = '';
    this.niveauEmailsCopieInput = '';
    this.editIndex = null;
    this.isEditingNiveau = false;
  }

  /** Indique si un niveau a au moins un email configuré. */
  hasNiveauEmails(niveau: NiveauTraitementConfig): boolean {
    return (niveau.destinatairesEmail?.length || 0) > 0 || (niveau.copieEmail?.length || 0) > 0;
  }

  /** Libellé des emails en copie d'un niveau. */
  getNiveauCopieLabel(niveau: NiveauTraitementConfig): string {
    return (niveau.copieEmail || []).join(', ');
  }

  toggleProfilAutorise(profilId: number): void {
    const idx = this.nouvelNiveau.profilsAutorisesIds.indexOf(profilId);
    if (idx >= 0) {
      this.nouvelNiveau.profilsAutorisesIds.splice(idx, 1);
    } else {
      this.nouvelNiveau.profilsAutorisesIds.push(profilId);
    }
  }

  isProfilAutorise(profilId: number): boolean {
    return this.nouvelNiveau.profilsAutorisesIds.includes(profilId);
  }

  get profilsSelectionnesLabel(): string {
    return this.nouvelNiveau.profilsAutorisesIds.map(id => this.getProfilNom(id)).join(', ');
  }

  getProfilsLabel(profilIds: number[]): string {
    return profilIds.map(id => this.getProfilNom(id)).join(', ') || 'Aucun';
  }

  /** Vérifie si un profil est autorisé pour un niveau donné (utilisé dans la matrice) */
  isProfilAutorisePourNiveau(niveau: NiveauTraitementConfig, profilId: number): boolean {
    return niveau.profilsAutorisesIds?.includes(profilId) ?? false;
  }

  // --- Ordonnancement ---
  monter(index: number): void {
    if (index > 0) {
      [this.configLocale.niveauxTraitement[index], this.configLocale.niveauxTraitement[index - 1]] = [this.configLocale.niveauxTraitement[index - 1], this.configLocale.niveauxTraitement[index]];
      this.reordonner();
    }
  }

  descendre(index: number): void {
    if (index < this.configLocale.niveauxTraitement.length - 1) {
      [this.configLocale.niveauxTraitement[index], this.configLocale.niveauxTraitement[index + 1]] = [this.configLocale.niveauxTraitement[index + 1], this.configLocale.niveauxTraitement[index]];
      this.reordonner();
    }
  }

  reordonner(): void {
    this.configLocale.niveauxTraitement.forEach((item, i) => item.ordre = i + 1);
    this.sauvegarderDansService();
    this.showToast('Ordre mis à jour', 'info');
  }

  // --- Sauvegarde par pays ---
  sauvegarderPaysActuel(): void {
    this.sauvegarderDansService();
  }

  sauvegarderTout(): void {
    // Sauvegarder tous les pays du service
    this.showToast('Toutes les configurations sauvegardées');
  }

  trackByIndex(index: number): number {
    return index;
  }
}