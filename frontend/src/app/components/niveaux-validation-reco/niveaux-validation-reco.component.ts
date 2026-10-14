import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
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

  nouvelNiveau = { valeur: '', ordre: 0, actif: true, description: '', statutAssocie: '', profilsAutorisesIds: [] as number[] };
  editIndex: number | null = null;
  isEditingNiveau = false;

  toastMessage: string = '';
  toastType: ToastType = 'success';
  private toastTimeout: any;

  constructor(
    private paysService: PaysService, 
    private profilService: ProfilService,
    private configService: NiveauxValidationConfigService
  ) {}

  ngOnInit(): void {
    this.chargerPays();
    this.chargerProfils();
    this.chargerConfigDepuisService();
  }

  ngOnDestroy(): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  chargerPays(): void {
    this.paysService.getPays().subscribe({
      next: (pays) => {
        this.paysList = pays;
        if (!this.paysList.find(p => p.code === 'GNL')) {
          this.paysList.unshift({ code: 'GNL', nom: 'GNL (Tous les pays)' });
        }
      },
      error: (err) => {
        console.error('Erreur chargement pays:', err);
        this.paysList = [{ code: 'GNL', nom: 'GNL (Tous les pays)' }];
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
    this.configLocale = this.configService.getConfigForPaysSync(this.selectedPaysCode);
  }

  chargerConfigParDefaut(): void {
    const defaut: NiveauxValidationConfig = {
      niveauxTraitement: [
        { valeur: 'Niveau Support', ordre: 1, actif: true, description: 'Premier niveau de traitement - Support', statutAssocie: 'EN_COURS_TRAITEMENT', profilsAutorisesIds: [] },
        { valeur: 'Responsable CDO', ordre: 2, actif: true, description: 'Validation par le Responsable CDO', statutAssocie: 'EN_COURS_VALIDATION', profilsAutorisesIds: [] },
        { valeur: 'Niveau GROUP', ordre: 3, actif: true, description: 'Validation au niveau GROUP', statutAssocie: 'EN_COURS_CLOTURE', profilsAutorisesIds: [] },
        { valeur: 'Terminé', ordre: 4, actif: true, description: 'Traitement complètement terminé', statutAssocie: 'TERMINE', profilsAutorisesIds: [] }
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

  // --- Niveaux de traitement ---
  sauvegarderNiveau(): void {
    if (!this.nouvelNiveau.valeur.trim()) return;

    const dataToSave: NiveauTraitementConfig = { 
      ...this.nouvelNiveau, 
      profilsAutorisesIds: [...this.nouvelNiveau.profilsAutorisesIds] 
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
      profilsAutorisesIds: [...niveau.profilsAutorisesIds] 
    };
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
    this.nouvelNiveau = { valeur: '', ordre: this.configLocale.niveauxTraitement.length + 1, actif: true, description: '', statutAssocie: '', profilsAutorisesIds: [] };
    this.editIndex = null;
    this.isEditingNiveau = false;
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