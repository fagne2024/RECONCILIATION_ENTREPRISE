import { Component, OnInit, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SopDocumentService } from '../../services/sop-document.service';
import { SopNodeService } from '../../services/sop-node.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

interface SOPNode {
  id: string;
  label: string;
  /** Clé i18n du libellé : permet de retrancher le texte sans figer la langue. */
  labelKey?: string;
  children?: SOPNode[];
  route?: string;
  description?: string;
}

/**
 * Structure SOP TRX par défaut. Les libellés sont doublés d'une clé i18n : le
 * catalogue pilote l'affichage, `label` reste la valeur de repli (nœuds
 * personnalisés, comparaison des libellés, génération d'identifiants).
 */
const DEFAULT_SOP_STRUCTURE: SOPNode = {
  id: 'root-trx',
  label: 'Visualisation des SOP',
  labelKey: 'SOP.shared.title',
  children: [
    {
      id: 'back-office-trx',
      label: 'Back Office',
      labelKey: 'SOP.reconciliationTrx.tree.backOffice',
      children: [
        {
          id: 'metier-trx',
          label: 'Métier',
          labelKey: 'SOP.reconciliationTrx.tree.metier',
          children: [
            { id: 'appro-client-trx', label: 'Appro client', labelKey: 'SOP.reconciliationTrx.tree.approClient' },
            { id: 'compense-client-trx', label: 'Compense client', labelKey: 'SOP.reconciliationTrx.tree.compenseClient' },
            { id: 'transfert-uv-trx', label: 'Transfert d\'UV', labelKey: 'SOP.reconciliationTrx.tree.transfertUv' }
          ]
        },
        {
          id: 'classique-trx',
          label: 'Classique',
          labelKey: 'SOP.reconciliationTrx.tree.classique',
          children: [
            { id: 'appro-client-classique-trx', label: 'Appro client', labelKey: 'SOP.reconciliationTrx.tree.approClient' },
            { id: 'compense-client-classique-trx', label: 'Compense client', labelKey: 'SOP.reconciliationTrx.tree.compenseClient' },
            { id: 'transfert-classique-trx', label: 'Transfert', labelKey: 'SOP.reconciliationTrx.tree.transfert' }
          ]
        }
      ]
    },
    {
      id: 'partenaire-trx',
      label: 'Partenaire',
      labelKey: 'SOP.reconciliationTrx.tree.partenaire',
      children: [
        {
          id: 'operations-partenaire',
          label: 'Opérations',
          labelKey: 'SOP.reconciliationTrx.tree.operations',
          children: [
            { id: 'depot-partenaire', label: 'Dépôt', labelKey: 'SOP.reconciliationTrx.tree.depot' },
            { id: 'retrait-partenaire', label: 'Retrait', labelKey: 'SOP.reconciliationTrx.tree.retrait' },
            { id: 'virement-partenaire', label: 'Virement', labelKey: 'SOP.reconciliationTrx.tree.virement' }
          ]
        },
        {
          id: 'reconciliation-partenaire',
          label: 'Réconciliation',
          labelKey: 'SOP.reconciliationTrx.tree.reconciliation',
          children: [
            { id: 'rapprochement-auto', label: 'Rapprochement automatique', labelKey: 'SOP.reconciliationTrx.tree.rapprochementAuto' },
            { id: 'rapprochement-manuel', label: 'Rapprochement manuel', labelKey: 'SOP.reconciliationTrx.tree.rapprochementManuel' },
            { id: 'ecarts-partenaire', label: 'Gestion des écarts', labelKey: 'SOP.reconciliationTrx.tree.gestionEcarts' }
          ]
        }
      ]
    }
  ]
};

/** Clés i18n des messages d'échec d'extraction, pour les repérer dans les deux langues. */
const EXTRACTION_FAILURE_KEYS = [
  'SOP.shared.extraction.notSupportedType',
  'SOP.shared.extraction.ocrUnavailable',
  'SOP.shared.extraction.imageError',
  'SOP.shared.extraction.pdfUnavailable',
  'SOP.shared.extraction.pdfError',
  'SOP.shared.extraction.wordUnavailable',
  'SOP.shared.extraction.wordError',
  'SOP.shared.extraction.docConversionNeeded'
];

@Component({
  selector: 'app-sop-reconciliation-trx',
  templateUrl: './sop-reconciliation-trx.component.html',
  styleUrls: ['./sop-reconciliation-trx.component.scss']
})
export class SopReconciliationTrxComponent implements OnInit {
  selectedNode: SOPNode | null = null;
  showPopup: boolean = false;
  popupNode: SOPNode | null = null;
  
  // Variables pour les opérations (maintenant gérées par les popups modernes)
  parentNodeForAdd: SOPNode | null = null;
  nodeToEdit: SOPNode | null = null;
  nodeToDelete: SOPNode | null = null;
  newLabel: string = '';
  editLabel: string = '';

  // Modal d'upload de document
  showUploadModal: boolean = false;
  uploadNodeId: string = '';
  uploadOptionType: string = '';
  selectedFile: File | null = null;
  isUploading: boolean = false;
  uploadError: string = '';
  manualText: string = '';
  showManualTextInput: boolean = false;
  isExtractingText: boolean = false;

  // Vue d'affichage du document
  showDocumentView: boolean = false;
  documentContent: string = '';
  documentTitle: string = '';
  currentOptionType: string = '';
  currentNodeId: string = '';
  safeDocumentContent: SafeHtml | null = null;

  // Modal de modification
  showEditDocumentModal: boolean = false;
  editDocumentFile: File | null = null;
  editDocumentText: string = '';
  isEditingDocument: boolean = false;

  
  // État de chargement
  isLoadingStructure: boolean = false;

  sopStructure: SOPNode = DEFAULT_SOP_STRUCTURE;

  // ── Visualisation (maquette) : recherche, repliage, volet de détail ──
  searchQuery = '';
  branchFilter: string | null = null;
  private collapsedCategories = new Set<string>();
  showDetail = false;
  detailBranch: SOPNode | null = null;
  detailCategory: SOPNode | null = null;
  detailItem: SOPNode | null = null;

  // ── Ajout d'une SOP (branche > catégorie > SOP) ──
  readonly NEW_CATEGORY = '__new__';
  showAddSopModal = false;
  addSopBranchId = '';
  addSopCategoryId = '';
  addSopNewCategory = '';
  addSopLabel = '';
  addSopError = '';
  isAddingSop = false;

  constructor(
    private sopDocumentService: SopDocumentService,
    private sopNodeService: SopNodeService,
    private popupService: PopupService,
    private sanitizer: DomSanitizer,
    private location: Location,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadStructure();
  }

  loadStructure(): void {
    this.isLoadingStructure = true;
    this.sopNodeService.getStructure(DEFAULT_SOP_STRUCTURE.id).subscribe({
      next: (response) => {
        if (response.success && response.structure) {
          this.sopStructure = this.withDefaultLabelKeys(response.structure as SOPNode, this.defaultNodesById());
        }
        this.isLoadingStructure = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement de la structure SOP TRX:', error);
        this.isLoadingStructure = false;
      }
    });
  }

  private defaultNodesById(): Map<string, SOPNode> {
    const map = new Map<string, SOPNode>();
    const visit = (node: SOPNode) => {
      map.set(node.id, node);
      node.children?.forEach(visit);
    };
    visit(DEFAULT_SOP_STRUCTURE);
    return map;
  }

  /** Un nœud par défaut non renommé garde sa clé i18n (libellé traduit selon la langue). */
  private withDefaultLabelKeys(node: SOPNode, defaults: Map<string, SOPNode>): SOPNode {
    const def = defaults.get(node.id);
    return {
      ...node,
      labelKey: def?.labelKey && def.label === node.label ? def.labelKey : undefined,
      children: node.children?.map(child => this.withDefaultLabelKeys(child, defaults))
    };
  }

  /** Détecte un message d'échec d'extraction, quelle que soit la langue active. */
  private isExtractionFailure(text: string): boolean {
    return EXTRACTION_FAILURE_KEYS.some(key => text.includes(I18nService.t(key)));
  }

  onNodeClick(node: SOPNode, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    
    if (node.children && node.children.length > 0) {
      // Si le nœud a des enfants, on peut afficher des détails ou naviguer
      this.selectedNode = node;
    } else {
      // Si c'est une feuille, afficher le popup avec les options
      this.popupNode = node;
      this.showPopup = true;
    }
  }

  closePopup(): void {
    this.showPopup = false;
    this.popupNode = null;
  }

  // ── Visualisation (maquette) : helpers d'arbre, recherche et volet de détail ──

  trackById(_index: number, node: SOPNode): string {
    return node.id;
  }

  branches(): SOPNode[] {
    return this.sopStructure?.children ?? [];
  }

  private categoryKey(branch: SOPNode, category: SOPNode): string {
    return `${branch.id}||${category.id}`;
  }

  private normalizeText(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private matchesSearch(node: SOPNode): boolean {
    const query = this.normalizeText(this.searchQuery);
    return !query || this.normalizeText(this.labelOf(node)).includes(query);
  }

  private matchesBranchFilter(branch: SOPNode): boolean {
    return !this.branchFilter || branch.id === this.branchFilter;
  }

  matchedItems(category: SOPNode): SOPNode[] {
    return (category.children ?? []).filter((item) => this.matchesSearch(item));
  }

  branchItemCount(branch: SOPNode): number {
    return (branch.children ?? []).reduce((sum, cat) => sum + (cat.children?.length ?? 0), 0);
  }

  visibleBranchItemCount(branch: SOPNode): number {
    return (branch.children ?? []).reduce((sum, cat) => sum + this.matchedItems(cat).length, 0);
  }

  totalItemCount(): number {
    return this.branches().reduce((sum, branch) => sum + this.branchItemCount(branch), 0);
  }

  visibleCategories(branch: SOPNode): SOPNode[] {
    const searching = !!this.searchQuery.trim();
    return (branch.children ?? []).filter((cat) => (searching ? this.matchedItems(cat).length > 0 : true));
  }

  visibleBranches(): SOPNode[] {
    const searching = !!this.searchQuery.trim();
    return this.branches().filter(
      (branch) => this.matchesBranchFilter(branch) && (!searching || this.visibleCategories(branch).length > 0)
    );
  }

  isSearching(): boolean {
    return !!this.searchQuery.trim();
  }

  isCategoryOpen(branch: SOPNode, category: SOPNode): boolean {
    if (this.searchQuery.trim()) {
      return true;
    }
    return !this.collapsedCategories.has(this.categoryKey(branch, category));
  }

  toggleCategory(branch: SOPNode, category: SOPNode): void {
    const key = this.categoryKey(branch, category);
    if (this.collapsedCategories.has(key)) {
      this.collapsedCategories.delete(key);
    } else {
      this.collapsedCategories.add(key);
    }
  }

  expandAll(): void {
    this.collapsedCategories.clear();
  }

  collapseAll(): void {
    this.collapsedCategories.clear();
    this.branches().forEach((branch) =>
      (branch.children ?? []).forEach((cat) => this.collapsedCategories.add(this.categoryKey(branch, cat)))
    );
  }

  setBranchFilter(id: string | null): void {
    this.branchFilter = id;
  }

  openDetail(branch: SOPNode, category: SOPNode, item: SOPNode): void {
    this.detailBranch = branch;
    this.detailCategory = category;
    this.detailItem = item;
    this.showDetail = true;
  }

  closeDetail(): void {
    this.showDetail = false;
  }

  openSopFromDetail(): void {
    if (!this.detailItem) {
      return;
    }
    this.popupNode = this.detailItem;
    this.showPopup = true;
  }

  async editDetail(event: Event): Promise<void> {
    const node = this.detailItem;
    if (!node) {
      return;
    }
    await this.openEditModal(node, event);
    this.closeDetail();
  }

  async deleteDetail(event: Event): Promise<void> {
    const node = this.detailItem;
    if (!node) {
      return;
    }
    await this.openDeleteModal(node, event);
    this.closeDetail();
  }

  onOptionClick(option: string): void {
    if (!this.popupNode) return;
    
    // Vérifier si le document existe
    this.sopDocumentService.checkDocumentExists(this.popupNode.id, option).subscribe({
      next: (response) => {
        if (response.exists) {
          // Le document existe, récupérer son contenu et l'afficher
          this.loadDocument(this.popupNode!.id, option);
        } else {
          // Le document n'existe pas, ouvrir le modal d'upload
          this.openUploadModal(this.popupNode!.id, option);
        }
        this.closePopup();
      },
      error: (error) => {
        console.error('Erreur lors de la vérification du document:', error);
        // En cas d'erreur, ouvrir le modal d'upload
        this.openUploadModal(this.popupNode!.id, option);
        this.closePopup();
      }
    });
  }

  openUploadModal(nodeId: string, optionType: string): void {
    this.uploadNodeId = nodeId;
    this.uploadOptionType = optionType;
    this.selectedFile = null;
    this.uploadError = '';
    this.manualText = '';
    this.showManualTextInput = false;
    this.isExtractingText = false;
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
    this.uploadNodeId = '';
    this.uploadOptionType = '';
    this.selectedFile = null;
    this.uploadError = '';
    this.manualText = '';
    this.showManualTextInput = false;
    this.isExtractingText = false;
  }

  async onFileSelected(event: Event): Promise<void> {
    console.log('📂 [FILE] Fichier sélectionné');
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      console.log('📂 [FILE] Fichier assigné:', {
        name: this.selectedFile.name,
        type: this.selectedFile.type,
        size: this.selectedFile.size
      });
      this.uploadError = '';
      this.manualText = '';
      this.showManualTextInput = false;
      
      // Essayer d'extraire le texte automatiquement
      if (this.selectedFile) {
        console.log('📂 [FILE] Déclenchement de l\'extraction automatique...');
        await this.tryExtractText();
      }
    } else {
      console.warn('⚠️ [FILE] Aucun fichier dans input.files');
    }
  }

  async tryExtractText(): Promise<void> {
    if (!this.selectedFile) {
      console.warn('⚠️ [EXTRACTION] Aucun fichier sélectionné');
      return;
    }
    
    console.log('🚀 [EXTRACTION] Début tentative extraction texte');
    console.log('📁 [EXTRACTION] Fichier:', this.selectedFile.name);
    
    this.isExtractingText = true;
    this.uploadError = '';
    
    try {
      const extractedText = await this.extractTextFromFile(this.selectedFile);
      
      console.log('✅ [EXTRACTION] Extraction terminée');
      console.log('📊 [EXTRACTION] Longueur texte extrait:', extractedText.length);
      console.log('📊 [EXTRACTION] Prévisualisation (100 premiers caractères):', extractedText.substring(0, 100));
      
      // Si l'extraction a réussi et n'est pas un message d'erreur
      const isError = this.isExtractionFailure(extractedText);

      console.log('🔍 [EXTRACTION] Est-ce une erreur?', isError);

      if (extractedText && !isError) {
        console.log('✅ [EXTRACTION] Extraction réussie, texte valide');
        this.manualText = extractedText;
        this.showManualTextInput = true;
      } else {
        console.warn('⚠️ [EXTRACTION] Extraction échouée ou message d\'erreur');
        // Si l'extraction a échoué, proposer la saisie manuelle
        this.showManualTextInput = true;
        if (extractedText.includes(I18nService.t('SOP.shared.extraction.notSupportedType')) ||
            extractedText.includes(I18nService.t('SOP.shared.extraction.ocrUnavailable')) ||
            extractedText.includes(I18nService.t('SOP.shared.extraction.pdfUnavailable')) ||
            extractedText.includes(I18nService.t('SOP.shared.extraction.wordUnavailable'))) {
          this.uploadError = I18nService.t('SOP.shared.upload.errors.autoUnavailable');
        }
      }
    } catch (error) {
      console.error('❌ [EXTRACTION] Erreur lors de l\'extraction:', error);
      console.error('❌ [EXTRACTION] Détails:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      this.showManualTextInput = true;
      this.uploadError = I18nService.t('SOP.shared.upload.errors.autoImpossible');
    } finally {
      this.isExtractingText = false;
      console.log('🏁 [EXTRACTION] Fin de la tentative d\'extraction');
    }
  }

  toggleManualTextInput(): void {
    // Cette méthode est appelée par le checkbox, donc showManualTextInput est déjà mis à jour par ngModel
    // On ne fait rien de spécial ici, juste s'assurer que le texte reste si on décoche
  }

  async uploadDocument(): Promise<void> {
    if (!this.selectedFile || !this.uploadNodeId || !this.uploadOptionType) {
      this.uploadError = I18nService.t('SOP.shared.upload.errors.noFile');
      return;
    }

    // Utiliser le texte manuel si disponible, sinon essayer l'extraction automatique
    let extractedText = this.manualText.trim();

    if (!extractedText) {
      // Si pas de texte manuel, essayer l'extraction automatique
      try {
        extractedText = await this.extractTextFromFile(this.selectedFile);
        // Si c'est un message d'erreur, demander à l'utilisateur de saisir manuellement
        if (this.isExtractionFailure(extractedText)) {
          this.uploadError = I18nService.t('SOP.shared.upload.errors.noTextBelowField');
          this.showManualTextInput = true;
          return;
        }
      } catch (error) {
        console.error('Erreur lors de l\'extraction:', error);
        this.uploadError = I18nService.t('SOP.shared.upload.errors.noTextManually');
        this.showManualTextInput = true;
        return;
      }
    }

    // Si toujours pas de texte, demander à l'utilisateur
    if (!extractedText || extractedText.trim().length === 0) {
      this.uploadError = I18nService.t('SOP.shared.upload.errors.noTextOrExtractableFile');
      this.showManualTextInput = true;
      return;
    }

    this.isUploading = true;
    this.uploadError = '';

    // Uploader le document avec le texte
    this.sopDocumentService.uploadDocument(
      this.selectedFile,
      this.uploadNodeId,
      this.uploadOptionType,
      extractedText
    ).subscribe({
      next: (response) => {
        if (response.success) {
          // Afficher le document après l'upload
          this.loadDocument(this.uploadNodeId, this.uploadOptionType);
          this.closeUploadModal();
        } else {
          this.uploadError = response.error || I18nService.t('SOP.shared.upload.errors.uploadFailed');
        }
        this.isUploading = false;
      },
      error: (error) => {
        console.error('Erreur lors de l\'upload:', error);
        this.uploadError = I18nService.t('SOP.shared.upload.errors.uploadDocumentFailed');
        this.isUploading = false;
      }
    });
  }

  async extractTextFromFile(file: File): Promise<string> {
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    console.log('🔍 [EXTRACTION] Début extraction texte');
    console.log('📄 [EXTRACTION] Nom du fichier:', file.name);
    console.log('📄 [EXTRACTION] Type MIME:', file.type);
    console.log('📄 [EXTRACTION] Taille:', file.size, 'bytes');
    console.log('📄 [EXTRACTION] fileName (lowercase):', fileName);
    console.log('📄 [EXTRACTION] fileType (lowercase):', fileType);

    // Pour les images, utiliser OCR (Tesseract.js)
    if (fileType.startsWith('image/') || fileName.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/i)) {
      console.log('🖼️ [EXTRACTION] Fichier détecté comme IMAGE');
      return await this.extractTextFromImage(file);
    }
    
    // Pour les PDFs, utiliser pdf.js
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      console.log('📑 [EXTRACTION] Fichier détecté comme PDF');
      return await this.extractTextFromPdf(file);
    }

    // Pour les fichiers texte
    if (fileType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      console.log('📝 [EXTRACTION] Fichier détecté comme TEXTE');
      return await this.readTextFile(file);
    }

    // Pour les fichiers Word
    if (fileName.endsWith('.docx')) {
      console.log('📘 [EXTRACTION] Fichier détecté comme DOCX');
      return await this.extractTextFromDocx(file);
    }
    
    if (fileName.endsWith('.doc')) {
      console.log('📗 [EXTRACTION] Fichier détecté comme DOC');
      return await this.extractTextFromDoc(file);
    }

    // Pour les autres types, retourner un message
    console.warn('⚠️ [EXTRACTION] Type de fichier non reconnu');
    return I18nService.t('SOP.shared.extraction.notSupportedType');
  }

  async extractTextFromImage(file: File): Promise<string> {
    try {
      const Tesseract = (window as any).Tesseract;
      if (Tesseract) {
        const { data: { text } } = await Tesseract.recognize(file);
        return text;
      } else {
        return I18nService.t('SOP.shared.extraction.ocrUnavailable');
      }
    } catch (error) {
      console.error('Erreur OCR:', error);
      return I18nService.t('SOP.shared.extraction.imageError');
    }
  }

  async extractTextFromPdf(file: File): Promise<string> {
    console.log('📑 [PDF] Début extraction PDF avec formatage');
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      console.log('📑 [PDF] pdfjsLib disponible?', !!pdfjsLib);
      
      if (pdfjsLib) {
        console.log('📑 [PDF] pdf.js trouvé, début extraction...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('📑 [PDF] ArrayBuffer créé, taille:', arrayBuffer.byteLength);
        
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          console.log('📑 [PDF] Configuration du worker pdf.js');
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        
        console.log('📑 [PDF] Chargement du document PDF...');
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        console.log('📑 [PDF] PDF chargé, nombre de pages:', pdf.numPages);
        
        let htmlContent = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          console.log(`📑 [PDF] Extraction page ${i}/${pdf.numPages} avec images...`);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          console.log(`📑 [PDF] Rendu de la page ${i} sur canvas...`);
          await page.render({
            canvasContext: context!,
            viewport: viewport
          }).promise;
          
          const pageImage = canvas.toDataURL('image/png');
          console.log(`📑 [PDF] Page ${i} convertie en image, taille: ${(pageImage.length / 1024).toFixed(2)} KB`);
          
          htmlContent += `<div class="pdf-page" style="text-align: center; margin-bottom: 30px;">
            <img src="${pageImage}" alt="${I18nService.t('SOP.shared.extraction.pageAlt', { page: i })}" style="max-width: 100%; height: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px;" />
          </div>\n`;
        }

        const result = htmlContent.trim() || I18nService.t('SOP.shared.extraction.pdfNoText');
        console.log('📑 [PDF] Extraction terminée, HTML généré:', result.length, 'caractères');
        return result;
      } else {
        console.warn('📑 [PDF] pdf.js non disponible');
        return I18nService.t('SOP.shared.extraction.pdfUnavailable');
      }
    } catch (error) {
      console.error('❌ [PDF] Erreur extraction PDF:', error);
      return I18nService.t('SOP.shared.extraction.pdfError');
    }
  }

  async readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve(e.target?.result as string);
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  async extractTextFromDocx(file: File): Promise<string> {
    console.log('📘 [DOCX] Début extraction DOCX');
    try {
      const mammoth = (window as any).mammoth;
      if (mammoth) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        return result.value || I18nService.t('SOP.shared.extraction.wordNoText');
      } else {
        return I18nService.t('SOP.shared.extraction.wordUnavailable');
      }
    } catch (error) {
      console.error('❌ [DOCX] Erreur extraction .docx:', error);
      return I18nService.t('SOP.shared.extraction.wordError');
    }
  }

  async extractTextFromDoc(file: File): Promise<string> {
    console.log('📗 [DOC] Format .doc non supporté');
    return I18nService.t('SOP.shared.extraction.docConversionNeeded');
  }

  loadDocument(nodeId: string, optionType: string): void {
    this.sopDocumentService.getDocumentContent(nodeId, optionType).subscribe({
      next: (response) => {
        if (response.exists && response.extractedText) {
          this.documentContent = response.extractedText;
          this.documentTitle = response.fileName || I18nService.t('SOP.shared.document.defaultName');
          this.currentOptionType = optionType;
          this.currentNodeId = nodeId;
          
          let formattedHtml = this.formatDocumentText(this.documentContent);
          formattedHtml = `<div class="document-wrapper" style="max-width: 100%; margin: 0 auto;">${formattedHtml}</div>`;
          
          const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, formattedHtml) || '';
          this.safeDocumentContent = this.sanitizer.bypassSecurityTrustHtml(sanitized);
          this.showDocumentView = true;
        } else {
          this.openUploadModal(nodeId, optionType);
        }
      },
      error: (error) => {
        console.error('Erreur lors du chargement du document:', error);
        this.openUploadModal(nodeId, optionType);
      }
    });
  }

  closeDocumentView(): void {
    this.showDocumentView = false;
    this.documentContent = '';
    this.documentTitle = '';
    this.currentOptionType = '';
    this.currentNodeId = '';
    this.safeDocumentContent = null;
  }

  downloadDocument(): void {
    if (!this.currentNodeId || !this.currentOptionType) {
      console.error('❌ [DOWNLOAD] Impossible de télécharger: informations du document manquantes.');
      return;
    }

    this.sopDocumentService.downloadDocument(this.currentNodeId, this.currentOptionType).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = this.documentTitle || `document_${this.currentNodeId}_${this.currentOptionType}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('❌ [DOWNLOAD] Erreur lors du téléchargement:', error);
        this.popupService.showError(I18nService.t('SOP.reconciliationTrx.documentOps.downloadErrorGeneric'), I18nService.t('SOP.shared.popup.downloadError'));
      }
    });
  }

  openEditDocumentModal(): void {
    this.editDocumentFile = null;
    this.editDocumentText = this.documentContent;
    this.showEditDocumentModal = true;
  }

  closeEditDocumentModal(): void {
    this.showEditDocumentModal = false;
    this.editDocumentFile = null;
    this.editDocumentText = '';
    this.isEditingDocument = false;
  }

  onEditFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.editDocumentFile = input.files[0];
    }
  }

  async updateDocument(): Promise<void> {
    if (!this.currentNodeId || !this.currentOptionType) {
      return;
    }

    this.isEditingDocument = true;

    try {
      let extractedText = this.editDocumentText;
      
      if (this.editDocumentFile) {
        try {
          const extracted = await this.extractTextFromFile(this.editDocumentFile);
          if (extracted && !this.isExtractionFailure(extracted)) {
            extractedText = extracted;
          }
        } catch (error) {
          console.error('Erreur lors de l\'extraction:', error);
        }
      }

      this.sopDocumentService.updateDocument(
        this.currentNodeId,
        this.currentOptionType,
        this.editDocumentFile || undefined,
        extractedText
      ).subscribe({
        next: (response) => {
          if (response.success) {
            this.loadDocument(this.currentNodeId, this.currentOptionType);
            this.closeEditDocumentModal();
          } else {
            this.popupService.showError(response.error || I18nService.t('SOP.shared.documentOps.updateError'), I18nService.t('SOP.shared.popup.updateError'));
          }
          this.isEditingDocument = false;
        },
        error: (error) => {
          console.error('Erreur lors de la modification:', error);
          this.popupService.showError(I18nService.t('SOP.shared.documentOps.updateErrorGeneric'), I18nService.t('SOP.shared.popup.updateError'));
          this.isEditingDocument = false;
        }
      });
    } catch (error) {
      console.error('Erreur:', error);
      this.isEditingDocument = false;
    }
  }

  async openDeleteDocumentModal(): Promise<void> {
    if (!this.currentNodeId || !this.currentOptionType) {
      return;
    }
    
    const message = I18nService.t('SOP.shared.documentOps.confirmDelete', { name: this.documentTitle });
    const confirmed = await this.popupService.showConfirm(message, I18nService.t('SOP.shared.popup.confirmDelete'));
    
    if (confirmed) {
      await this.deleteDocument();
    }
  }

  private async deleteDocument(): Promise<void> {
    if (!this.currentNodeId || !this.currentOptionType) {
      return;
    }

    this.sopDocumentService.deleteDocument(
      this.currentNodeId,
      this.currentOptionType
    ).subscribe({
      next: async (response) => {
        if (response.success) {
          this.closeDocumentView();
          await this.popupService.showSuccess(I18nService.t('SOP.shared.documentOps.deletedSuccess'), I18nService.t('POPUP.success'));
        } else {
          await this.popupService.showError(response.error || I18nService.t('SOP.shared.documentOps.deleteError'), I18nService.t('SOP.shared.popup.deleteError'));
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la suppression:', error);
        if (error.status === 404) {
          this.closeDocumentView();
          await this.popupService.showInfo(I18nService.t('SOP.shared.documentOps.alreadyDeleted'), I18nService.t('POPUP.info'));
        } else {
          await this.popupService.showError(I18nService.t('SOP.reconciliationTrx.documentOps.deleteErrorGeneric'), I18nService.t('SOP.shared.popup.deleteError'));
        }
      }
    });
  }

  hasChildren(node: SOPNode): boolean {
    return node.children && node.children.length > 0;
  }

  /**
   * Libellé d'un nœud dans la langue active. Les nœuds standard sont traduits via
   * leur clé, les nœuds personnalisés conservent le libellé saisi en base.
   */
  labelOf(node: SOPNode | null | undefined): string {
    if (!node) {
      return '';
    }
    return node.labelKey ? I18nService.t(node.labelKey) : node.label;
  }

  async openAddModal(node: SOPNode, event: Event): Promise<void> {
    event.stopPropagation();
    this.parentNodeForAdd = node;

    const label = await this.popupService.showTextInput(
      I18nService.t('SOP.shared.node.addLabelPrompt'),
      I18nService.t('SOP.shared.popup.addNodeTitle'),
      '',
      I18nService.t('SOP.shared.node.addPlaceholder')
    );
    
    if (label && label.trim()) {
      await this.addNode(label.trim());
    }
  }

  private async addNode(newLabel: string): Promise<void> {
    if (!this.parentNodeForAdd || !newLabel.trim()) {
      return;
    }

    const newNodeId = this.generateId(newLabel);
    this.sopNodeService.createNode(newNodeId, newLabel, this.parentNodeForAdd.id).subscribe({
      next: async (response) => {
        if (response.success) {
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('SOP.shared.node.createdSuccess'), I18nService.t('POPUP.success'));
        } else {
          await this.popupService.showError(
            I18nService.t('SOP.shared.node.createdErrorDetail', {
              error: response.error || I18nService.t('SOP.shared.popup.unknownError')
            }),
            I18nService.t('SOP.shared.popup.createError')
          );
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la création:', error);
        await this.popupService.showError(I18nService.t('SOP.shared.node.createdError'), I18nService.t('SOP.shared.popup.createError'));
      }
    });
  }

  async openEditModal(node: SOPNode, event: Event): Promise<void> {
    event.stopPropagation();
    this.nodeToEdit = node;
    
    const newLabel = await this.popupService.showTextInput(
      I18nService.t('SOP.shared.node.editLabelPrompt'),
      I18nService.t('SOP.shared.popup.editNodeTitle'),
      this.labelOf(node),
      I18nService.t('SOP.shared.node.editPlaceholder')
    );

    if (newLabel && newLabel.trim() && newLabel.trim() !== this.labelOf(node)) {
      await this.editNode(newLabel.trim());
    }
  }

  private async editNode(newLabel: string): Promise<void> {
    if (!this.nodeToEdit || !newLabel.trim()) {
      return;
    }

    this.sopNodeService.updateNode(this.nodeToEdit.id, newLabel).subscribe({
      next: async (response) => {
        if (response.success) {
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('SOP.shared.node.updatedSuccess'), I18nService.t('POPUP.success'));
        } else {
          await this.popupService.showError(
            I18nService.t('SOP.shared.node.updatedErrorDetail', {
              error: response.error || I18nService.t('SOP.shared.popup.unknownError')
            }),
            I18nService.t('SOP.shared.popup.updateError')
          );
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la modification:', error);
        await this.popupService.showError(I18nService.t('SOP.shared.node.updatedError'), I18nService.t('SOP.shared.popup.updateError'));
      }
    });
  }

  async openDeleteModal(node: SOPNode, event: Event): Promise<void> {
    event.stopPropagation();
    this.nodeToDelete = node;
    
    let message = I18nService.t('SOP.shared.node.deleteMessage', { name: this.labelOf(node) });
    if (node.children && node.children.length > 0) {
      message += I18nService.t('SOP.shared.node.deleteChildrenWarning', { count: node.children.length });
    }

    const confirmed = await this.popupService.showConfirm(message, I18nService.t('SOP.shared.popup.confirmDelete'));
    
    if (confirmed) {
      await this.deleteNode();
    }
  }

  private async deleteNode(): Promise<void> {
    if (!this.nodeToDelete) {
      return;
    }

    const nodeIdToDelete = this.nodeToDelete.id;

    this.sopNodeService.deleteNode(nodeIdToDelete).subscribe({
      next: async (response) => {
        if (response.success) {
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('SOP.shared.node.deletedSuccess'), I18nService.t('POPUP.success'));
        } else {
          await this.popupService.showError(
            I18nService.t('SOP.shared.node.deletedErrorDetail', {
              error: response.error || I18nService.t('SOP.shared.popup.unknownError')
            }),
            I18nService.t('SOP.shared.popup.deleteError')
          );
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la suppression:', error);
        await this.popupService.showError(I18nService.t('SOP.shared.node.deletedError'), I18nService.t('SOP.shared.popup.deleteError'));
      }
    });
  }

  openAddSopModal(branch?: SOPNode, category?: SOPNode, event?: Event): void {
    event?.stopPropagation();
    const targetBranch = branch ?? this.branches().find((b) => b.id === this.branchFilter) ?? this.branches()[0];
    this.addSopBranchId = targetBranch?.id ?? '';
    this.addSopCategoryId = category?.id ?? targetBranch?.children?.[0]?.id ?? this.NEW_CATEGORY;
    this.addSopNewCategory = '';
    this.addSopLabel = '';
    this.addSopError = '';
    this.isAddingSop = false;
    this.showAddSopModal = true;
  }

  closeAddSopModal(): void {
    if (this.isAddingSop) {
      return;
    }
    this.showAddSopModal = false;
  }

  addSopCategories(): SOPNode[] {
    return this.branches().find((b) => b.id === this.addSopBranchId)?.children ?? [];
  }

  onAddSopBranchChange(): void {
    this.addSopCategoryId = this.addSopCategories()[0]?.id ?? this.NEW_CATEGORY;
    this.addSopError = '';
  }

  canSubmitAddSop(): boolean {
    const needsNewCategory = this.addSopCategoryId === this.NEW_CATEGORY;
    return !this.isAddingSop
      && !!this.addSopBranchId
      && !!this.addSopLabel.trim()
      && (!needsNewCategory || !!this.addSopNewCategory.trim());
  }

  submitAddSop(): void {
    if (!this.canSubmitAddSop()) {
      return;
    }
    const label = this.addSopLabel.trim();
    const creatingCategory = this.addSopCategoryId === this.NEW_CATEGORY;
    const category = creatingCategory ? undefined : this.addSopCategories().find((c) => c.id === this.addSopCategoryId);
    const sameName = (node: SOPNode) => this.normalizeText(this.labelOf(node)) === this.normalizeText(label);
    if (category?.children?.some(sameName)) {
      this.addSopError = I18nService.t('SOP.reconciliationTrx.addSop.duplicate');
      return;
    }

    this.isAddingSop = true;
    this.addSopError = '';

    const categoryId$: Observable<string> = creatingCategory
      ? this.createChildNode(this.addSopNewCategory.trim(), this.addSopBranchId)
      : of(this.addSopCategoryId);

    categoryId$.pipe(
      switchMap((categoryId) => this.createChildNode(label, categoryId).pipe(map((sopId) => ({ categoryId, sopId }))))
    ).subscribe({
      next: async ({ categoryId, sopId }) => {
        this.isAddingSop = false;
        this.showAddSopModal = false;
        this.collapsedCategories.delete(`${this.addSopBranchId}||${categoryId}`);
        if (this.branchFilter && this.branchFilter !== this.addSopBranchId) {
          this.branchFilter = null;
        }
        this.searchQuery = '';
        this.loadStructure();
        await this.popupService.showSuccess(
          I18nService.t('SOP.reconciliationTrx.addSop.createdSuccess', { name: label }),
          I18nService.t('POPUP.success')
        );
        this.popupNode = { id: sopId, label };
        this.showPopup = true;
      },
      error: (error) => {
        console.error('Erreur lors de la création de la SOP:', error);
        this.isAddingSop = false;
        this.addSopError = error?.message && !error?.status
          ? error.message
          : I18nService.t('SOP.reconciliationTrx.addSop.createError');
        if (creatingCategory) {
          this.loadStructure();
        }
      }
    });
  }

  /** Crée un nœud sous `parentId` et émet son identifiant ; une réponse `success: false` devient une erreur. */
  private createChildNode(label: string, parentId: string): Observable<string> {
    const nodeId = this.generateId(label);
    return this.sopNodeService.createNode(nodeId, label, parentId).pipe(
      map((response) => {
        if (!response.success) {
          throw new Error(response.error || I18nService.t('SOP.reconciliationTrx.addSop.createError'));
        }
        return response.nodeId || nodeId;
      })
    );
  }

  private generateId(label: string): string {
    return label.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Date.now();
  }

  formatDocumentText(text: string): string {
    if (!text) return '';
    
    const hasHtmlTags = /<[^>]+>/g.test(text);
    const hasImages = /<img[^>]*>/gi.test(text);
    const hasInlineStyles = /style\s*=\s*["'][^"']*["']/gi.test(text);
    
    if (hasHtmlTags || hasImages || hasInlineStyles) {
      return text;
    }
    
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    escaped = escaped.replace(/^([A-Z\s\-–—]+)$/gm, '<h3 class="document-title">$1</h3>');
    escaped = escaped.replace(/^(\d+\.\s+[^\n]+)$/gm, '<h4 class="document-section">$1</h4>');
    escaped = escaped.replace(/^(\s*[\*\-\•]\s+[^\n]+)$/gm, '<div class="document-item">$1</div>');
    escaped = escaped.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    
    escaped = escaped.split(/\n\n+/).map(para => {
      if (para.trim() && !para.includes('<h3') && !para.includes('<h4') && !para.includes('<div class="document-item"')) {
        return `<p class="document-paragraph">${para.trim().replace(/\n/g, '<br>')}</p>`;
      }
      return para;
    }).join('');
    
    escaped = escaped.replace(/\n/g, '<br>');
    
    return escaped;
  }

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  goToAide(): void {
    this.router.navigate(['/aide']);
  }
}







