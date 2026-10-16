import { Component, OnInit, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
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
 * Structure SOP par défaut. Les libellés sont doublés d'une clé i18n : le
 * catalogue pilote l'affichage, `label` reste la valeur de repli (nœuds
 * personnalisés, comparaison des libellés, génération d'identifiants).
 */
const DEFAULT_SOP_STRUCTURE: SOPNode = {
  id: 'root',
  label: 'Visualisation des SOP',
  labelKey: 'SOP.shared.title',
  children: [
    {
      id: 'back-office',
      label: 'Back office',
      labelKey: 'SOP.operation.tree.backOffice',
      children: [
        {
          id: 'metier-gu3',
          label: 'Métier (GU3)',
          labelKey: 'SOP.operation.tree.metierGu3',
          children: [
            { id: 'appro-client-client', label: 'Appro client par client', labelKey: 'SOP.operation.tree.approClientPerClient' },
            { id: 'appro-client-ops', label: 'Appro client par OPS', labelKey: 'SOP.operation.tree.approClientPerOps' },
            { id: 'appro-fournisseur', label: 'Appro fournisseur', labelKey: 'SOP.operation.tree.approFournisseur' },
            { id: 'compense-client-client', label: 'Compense client par le client', labelKey: 'SOP.operation.tree.compenseClientPerClient' },
            { id: 'compense-client-ops', label: 'Compense client par OPS', labelKey: 'SOP.operation.tree.compenseClientPerOps' },
            { id: 'compense-fournisseur', label: 'Compense Fournisseur', labelKey: 'SOP.operation.tree.compenseFournisseur' },
            { id: 'transfert-uv-sous-compte', label: 'Transfert d\'UV sous compte vers le compte', labelKey: 'SOP.operation.tree.transfertUvSousCompteVersCompte' },
            { id: 'transfert-uv-compte', label: 'Transfert d\'UV compte vers le sous compte', labelKey: 'SOP.operation.tree.transfertUvCompteVersSousCompte' }
          ]
        },
        {
          id: 'classique',
          label: 'Classique',
          labelKey: 'SOP.operation.tree.classique',
          children: [
            { id: 'appro-client-classique', label: 'Appro client par le client', labelKey: 'SOP.operation.tree.approClientClassique' },
            { id: 'appro-client-ops-classique', label: 'Appro client par OPS', labelKey: 'SOP.operation.tree.approClientOpsClassique' },
            { id: 'appro-fournisseur-classique', label: 'Appro fournisseur', labelKey: 'SOP.operation.tree.approFournisseurClassique' },
            { id: 'compense-client-classique', label: 'Compense client', labelKey: 'SOP.operation.tree.compenseClientClassique' },
            { id: 'compense-fournisseur-classique', label: 'Compense Fournisseur', labelKey: 'SOP.operation.tree.compenseFournisseurClassique' }
          ]
        },
        {
          id: 'gu2',
          label: 'GU2',
          labelKey: 'SOP.operation.tree.gu2',
          children: [
            { id: 'appro-client-gu2', label: 'Appro client', labelKey: 'SOP.operation.tree.approClientGu2' },
            { id: 'compense-client-gu2', label: 'Compense client', labelKey: 'SOP.operation.tree.compenseClientGu2' },
            { id: 'transfert-uv-sous-compte-gu2', label: 'Transfert d\'UV sous compte vers le compte', labelKey: 'SOP.operation.tree.transfertUvSousCompteVersCompteGu2' },
            { id: 'transfert-uv-compte-gu2', label: 'Transfert d\'UV compte vers le sous compte', labelKey: 'SOP.operation.tree.transfertUvCompteVersSousCompteGu2' }
          ]
        }
      ]
    },
    {
      id: 'autres',
      label: 'Autres',
      labelKey: 'SOP.operation.tree.autres',
      children: [
        {
          id: 'annulation',
          label: 'Annulation',
          labelKey: 'SOP.operation.tree.annulation',
          children: [
            { id: 'annulation-operation', label: 'Annulation Opération (tous les BO)', labelKey: 'SOP.operation.tree.annulationOperation' },
            { id: 'annulation-transaction-metier', label: 'Annulation transaction BO métier', labelKey: 'SOP.operation.tree.annulationTransactionMetier' },
            { id: 'annulation-transaction-classique', label: 'Annulation transaction BO Classique', labelKey: 'SOP.operation.tree.annulationTransactionClassique' }
          ]
        },
        {
          id: 'transfert-uv-inter-filiale',
          label: 'Transfert d\'UV inter filiale',
          labelKey: 'SOP.operation.tree.transfertUvInterFiliale',
          children: [
            { id: 'virement-bancaire', label: 'Via une virement bancaire', labelKey: 'SOP.operation.tree.virementBancaire' },
            { id: 'service-touchpoint', label: 'Via le service TOUCHPOINT', labelKey: 'SOP.operation.tree.serviceTouchpoint' }
          ]
        },
        {
          id: 'ajustement-memo',
          label: 'L\'usage de la fonctionnalité Ajustement et Memo',
          labelKey: 'SOP.operation.tree.ajustementMemo',
          children: [
            { id: 'ajustement-solde', label: 'Ajustement de solde (Classique)', labelKey: 'SOP.operation.tree.ajustementSolde' },
            { id: 'utilisation-memo', label: 'L\'utilisation d\'un Memo (tous les BO)', labelKey: 'SOP.operation.tree.utilisationMemo' }
          ]
        },
        {
          id: 'probleme-technique',
          label: 'Problème technique et anomalie REC',
          labelKey: 'SOP.operation.tree.problemeTechnique',
          children: [
            { id: 'correction-anomalie', label: 'Correction anomalie Réconciliation (tous les BO)', labelKey: 'SOP.operation.tree.correctionAnomalie' },
            { id: 'probleme-technique-ops', label: 'Problème technique lié au traitement des OPS (tous les BO)', labelKey: 'SOP.operation.tree.problemeTechniqueOps' }
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

/** Indexe `id` -> clé i18n à partir de la structure de référence. */
function indexNodeLabelKeys(node: SOPNode, index: Record<string, string>): Record<string, string> {
  if (node.labelKey) {
    index[node.id] = node.labelKey;
  }
  (node.children || []).forEach(child => indexNodeLabelKeys(child, index));
  return index;
}

@Component({
  selector: 'app-sop-operation',
  templateUrl: './sop-operation.component.html',
  styleUrls: ['./sop-operation.component.scss']
})
export class SopOperationComponent implements OnInit {
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

  /** Clé i18n du libellé de chaque nœud de la structure par défaut, indexée par id. */
  private readonly nodeLabelKeys: Record<string, string> = indexNodeLabelKeys(DEFAULT_SOP_STRUCTURE, {});

  sopStructure: SOPNode = DEFAULT_SOP_STRUCTURE;

  // ── Visualisation (maquette) : recherche, repliage, volet de détail ──
  searchQuery = '';
  branchFilter: string | null = null;
  private collapsedCategories = new Set<string>();
  showDetail = false;
  detailBranch: SOPNode | null = null;
  detailCategory: SOPNode | null = null;
  detailItem: SOPNode | null = null;

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
    this.sopNodeService.getStructure().subscribe({
      next: (response) => {
        if (response.success && response.structure) {
          this.applyLabelKeys(response.structure);
          this.sopStructure = response.structure;
        } else {
          console.error('Erreur lors du chargement de la structure:', response.error);
          // En cas d'erreur, utiliser la structure par défaut
        }
        this.isLoadingStructure = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement de la structure:', error);
        // En cas d'erreur, utiliser la structure par défaut
        this.isLoadingStructure = false;
      }
    });
  }

  /**
   * Associe à chaque nœud la clé i18n de son libellé. La structure renvoyée par
   * l'API ne contient que des libellés en base : on la recale sur le catalogue
   * pour que le changement de langue s'applique aussi aux nœuds standards.
   * Les nœuds personnalisés, absents de l'index, gardent leur libellé brut.
   */
  private applyLabelKeys(node: SOPNode): void {
    if (!node.labelKey) {
      node.labelKey = this.nodeLabelKeys[node.id];
    }
    (node.children || []).forEach(child => this.applyLabelKeys(child));
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
    return this.branches().filter(
      (branch) => this.matchesBranchFilter(branch) && this.visibleCategories(branch).length > 0
    );
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
      console.log('📑 [EXTRACTION] Vérification condition PDF - fileType === "application/pdf":', fileType === 'application/pdf');
      console.log('📑 [EXTRACTION] Vérification condition PDF - fileName.endsWith(".pdf"):', fileName.endsWith('.pdf'));
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
      console.log('📘 [EXTRACTION] Vérification .docx - fileName:', fileName, 'endsWith(".docx"):', fileName.endsWith('.docx'));
      return await this.extractTextFromDocx(file);
    }
    
    if (fileName.endsWith('.doc')) {
      console.log('📗 [EXTRACTION] Fichier détecté comme DOC');
      console.log('📗 [EXTRACTION] Vérification .doc - fileName:', fileName, 'endsWith(".doc"):', fileName.endsWith('.doc'));
      return await this.extractTextFromDoc(file);
    }

    // Pour les autres types, retourner un message
    console.warn('⚠️ [EXTRACTION] Type de fichier non reconnu');
    console.warn('⚠️ [EXTRACTION] Aucune correspondance trouvée pour:', { fileName, fileType });
    return I18nService.t('SOP.shared.extraction.notSupportedType');
  }

  async extractTextFromImage(file: File): Promise<string> {
    // Utiliser Tesseract.js pour l'OCR
    try {
      // Dynamiquement importer Tesseract si disponible
      const Tesseract = (window as any).Tesseract;
      if (Tesseract) {
        const { data: { text } } = await Tesseract.recognize(file);
        return text;
      } else {
        // Si Tesseract n'est pas disponible, retourner un message
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
      // Utiliser pdf.js pour extraire le texte avec structure
      const pdfjsLib = (window as any).pdfjsLib;
      console.log('📑 [PDF] pdfjsLib disponible?', !!pdfjsLib);
      
      if (pdfjsLib) {
        console.log('📑 [PDF] pdf.js trouvé, début extraction...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('📑 [PDF] ArrayBuffer créé, taille:', arrayBuffer.byteLength);
        
        // Configurer le worker si nécessaire
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
          const viewport = page.getViewport({ scale: 2.0 }); // Scale pour meilleure qualité
          
          // Créer un canvas pour capturer la page complète avec images et couleurs
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          console.log(`📑 [PDF] Rendu de la page ${i} sur canvas...`);
          await page.render({
            canvasContext: context!,
            viewport: viewport
          }).promise;
          
          // Convertir le canvas en image base64 pour conserver la mise en page exacte
          const pageImage = canvas.toDataURL('image/png');
          console.log(`📑 [PDF] Page ${i} convertie en image, taille: ${(pageImage.length / 1024).toFixed(2)} KB`);
          
          // Ajouter l'image de la page au HTML
          htmlContent += `<div class="pdf-page" style="text-align: center; margin-bottom: 30px;">
            <img src="${pageImage}" alt="${I18nService.t('SOP.shared.extraction.pageAlt', { page: i })}" style="max-width: 100%; height: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px;" />
          </div>\n`;
        }

        const result = htmlContent.trim() || I18nService.t('SOP.shared.extraction.pdfNoText');
        console.log('📑 [PDF] Extraction terminée, HTML généré:', result.length, 'caractères');
        return result;
      } else {
        console.warn('📑 [PDF] pdf.js non disponible, tentative de chargement...');
        // Essayer de charger pdf.js dynamiquement
        try {
          await this.loadPdfJs();
          console.log('📑 [PDF] pdf.js chargé avec succès, nouvelle tentative...');
          return await this.extractTextFromPdf(file); // Réessayer après chargement
        } catch (loadError) {
          console.error('❌ [PDF] Erreur chargement pdf.js:', loadError);
          return I18nService.t('SOP.shared.extraction.pdfUnavailable');
        }
      }
    } catch (error) {
      console.error('❌ [PDF] Erreur extraction PDF:', error);
      console.error('❌ [PDF] Détails erreur:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      return I18nService.t('SOP.shared.extraction.pdfError');
    }
  }

  async loadPdfJs(): Promise<void> {
    console.log('📚 [PDF] Tentative de chargement de pdf.js...');
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        console.log('✅ [PDF] pdf.js déjà disponible');
        resolve();
        return;
      }

      console.log('📚 [PDF] Création du script pour charger pdf.js...');
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        console.log('📚 [PDF] Script chargé, vérification de pdfjsLib...');
        if ((window as any).pdfjsLib) {
          console.log('✅ [PDF] pdf.js chargé avec succès');
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          console.log('✅ [PDF] Worker configuré');
          resolve();
        } else {
          console.error('❌ [PDF] pdfjsLib non disponible après chargement');
          reject(new Error(I18nService.t('SOP.shared.extraction.pdfJsLoadFailed')));
        }
      };
      script.onerror = (error) => {
        console.error('❌ [PDF] Erreur lors du chargement du script:', error);
        reject(new Error(I18nService.t('SOP.shared.extraction.pdfJsLoadError')));
      };
      document.head.appendChild(script);
      console.log('📚 [PDF] Script ajouté au DOM');
    });
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
    console.log('📘 [DOCX] Début extraction DOCX avec formatage HTML');
    try {
      // Utiliser mammoth.js pour convertir en HTML et conserver la mise en forme
      const mammoth = (window as any).mammoth;
      console.log('📘 [DOCX] mammoth disponible?', !!mammoth);
      
      if (mammoth) {
        console.log('📘 [DOCX] mammoth.js trouvé, début extraction...');
        const arrayBuffer = await file.arrayBuffer();
        console.log('📘 [DOCX] ArrayBuffer créé, taille:', arrayBuffer.byteLength);
        
        console.log('📘 [DOCX] Conversion en HTML avec formatage complet (couleurs, images, mise en page)...');
        // Utiliser convertToHtml avec conversion des images en base64 pour conserver les photos et logo
        let result;
        try {
          // Configuration pour préserver TOUS les styles inline (couleurs, fonts, etc.)
          // Mammoth.js préserve les styles inline par défaut, mais on peut améliorer avec des options
          const options: any = {
            arrayBuffer,
            // Préserver les styles inline - mammoth.js les préserve par défaut
            includeDefaultStyleMap: true,
            // Forcer la préservation de tous les styles inline
            includeEmbeddedStyleMap: true,
            // Mapper les styles de titre tout en préservant les styles inline
            styleMap: [
              "p[style-name='Title'] => h1",
              "p[style-name='Heading 1'] => h1",
              "p[style-name='Heading 2'] => h2",
              "p[style-name='Heading 3'] => h3",
              // Préserver les styles de paragraphe avec couleurs
              "p[style-name='Normal'] => p",
              // Préserver les styles de texte coloré
              "r[style-name='Strong'] => strong",
              "r[style-name='Emphasis'] => em"
            ]
          };
          
          // Essayer avec conversion d'images si disponible
          if (mammoth.images && mammoth.images.imgElement) {
            console.log('📘 [DOCX] Conversion avec images en base64 (logo, photos)...');
            options.convertImage = mammoth.images.imgElement((image: any) => {
              console.log('📘 [DOCX] Conversion image:', image.contentType, 'dimensions:', image.width, 'x', image.height);
              return image.read().then((imageBuffer: any) => {
                console.log('📘 [DOCX] Buffer reçu, type:', typeof imageBuffer, 'isArrayBuffer:', imageBuffer instanceof ArrayBuffer);
                
                // Convertir le buffer en base64
                let base64 = '';
                try {
                  if (imageBuffer instanceof ArrayBuffer) {
                    const bytes = new Uint8Array(imageBuffer);
                    let binary = '';
                    const chunkSize = 8192; // Traiter par chunks pour éviter les problèmes de mémoire
                    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
                      const chunk = bytes.subarray(i, i + chunkSize);
                      binary += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    base64 = btoa(binary);
                  } else if (imageBuffer && imageBuffer.toBase64) {
                    base64 = imageBuffer.toBase64();
                  } else if (typeof imageBuffer === 'string') {
                    base64 = imageBuffer;
                  } else if (imageBuffer && imageBuffer.buffer) {
                    // Si c'est une vue (Uint8Array, etc.), utiliser le buffer sous-jacent
                    const bytes = new Uint8Array(imageBuffer.buffer);
                    let binary = '';
                    const chunkSize = 8192;
                    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
                      const chunk = bytes.subarray(i, i + chunkSize);
                      binary += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    base64 = btoa(binary);
                  } else {
                    // Fallback: essayer de convertir directement
                    const bytes = new Uint8Array(imageBuffer);
                    let binary = '';
                    const chunkSize = 8192;
                    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
                      const chunk = bytes.subarray(i, i + chunkSize);
                      binary += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    base64 = btoa(binary);
                  }
                  
                  console.log('📘 [DOCX] Image convertie avec succès:', image.contentType, 'taille base64:', (base64.length / 1024).toFixed(2), 'KB');
                  
                  const imgSrc = 'data:' + image.contentType + ';base64,' + base64;
                  const imgElement: any = {
                    src: imgSrc
                  };
                  
                  // Préserver les dimensions originales si disponibles
                  if (image.width) {
                    imgElement.width = image.width + 'px';
                  }
                  if (image.height) {
                    imgElement.height = image.height + 'px';
                  }
                  
                  return imgElement;
                } catch (conversionError) {
                  console.error('📘 [DOCX] Erreur lors de la conversion base64:', conversionError);
                  throw conversionError;
                }
              }).catch((error: any) => {
                console.warn('📘 [DOCX] Erreur conversion image:', error);
                // Retourner une image placeholder en cas d'erreur
                return {
                  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                  alt: I18nService.t('SOP.shared.extraction.imageUnavailable')
                };
              });
            });
          } else {
            console.log('📘 [DOCX] Conversion sans conversion d\'images (fonctionnalité non disponible)');
          }
          
          result = await mammoth.convertToHtml(options);
        } catch (error) {
          console.warn('📘 [DOCX] Erreur avec conversion, fallback simple:', error);
          result = await mammoth.convertToHtml({ arrayBuffer });
        }
        console.log('📘 [DOCX] Résultat extraction:', {
          hasValue: !!result.value,
          valueLength: result.value?.length || 0,
          messages: result.messages
        });
        
        if (result.messages && result.messages.length > 0) {
          console.log('📘 [DOCX] Messages mammoth:', result.messages);
        }
        
        let extractedHtml = result.value || I18nService.t('SOP.shared.extraction.wordNoText');
        
        // Vérifier que le HTML contient des styles inline et images
        const hasInlineStyles = /style\s*=\s*["'][^"']*["']/gi.test(extractedHtml);
        const hasImages = /<img[^>]*>/gi.test(extractedHtml);
        const imageCount = (extractedHtml.match(/<img[^>]*>/gi) || []).length;
        const styleCount = (extractedHtml.match(/style\s*=\s*["'][^"']*["']/gi) || []).length;
        
        console.log('📘 [DOCX] HTML généré avec images et formatage préservés');
        console.log('📘 [DOCX] Contient styles inline:', hasInlineStyles, `(${styleCount} occurrences)`);
        console.log('📘 [DOCX] Contient images:', hasImages, `(${imageCount} images)`);
        console.log('📘 [DOCX] Extraction terminée, HTML:', extractedHtml.length, 'caractères');
        
        // Prévisualisation du début du HTML pour debug
        if (extractedHtml.length > 0) {
          const preview = extractedHtml.substring(0, Math.min(500, extractedHtml.length));
          console.log('📘 [DOCX] Aperçu HTML (500 premiers caractères):', preview);
          
          // Afficher un exemple d'image si présent
          const imgMatch = extractedHtml.match(/<img[^>]*>/i);
          if (imgMatch) {
            console.log('📘 [DOCX] Exemple de balise img trouvée:', imgMatch[0].substring(0, 200));
          }
        }
        
        return extractedHtml;
      } else {
        console.warn('📘 [DOCX] mammoth.js non disponible, tentative de chargement...');
        // Essayer de charger mammoth.js dynamiquement
        try {
          await this.loadMammothJs();
          console.log('📘 [DOCX] mammoth.js chargé avec succès, nouvelle tentative...');
          return await this.extractTextFromDocx(file); // Réessayer après chargement
        } catch (loadError) {
          console.error('❌ [DOCX] Erreur chargement mammoth.js:', loadError);
          return I18nService.t('SOP.shared.extraction.wordUnavailable');
        }
      }
    } catch (error) {
      console.error('❌ [DOCX] Erreur extraction .docx:', error);
      console.error('❌ [DOCX] Détails erreur:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      return I18nService.t('SOP.shared.extraction.wordError');
    }
  }

  async loadMammothJs(): Promise<void> {
    console.log('📚 [DOCX] Tentative de chargement de mammoth.js...');
    return new Promise((resolve, reject) => {
      if ((window as any).mammoth) {
        console.log('✅ [DOCX] mammoth.js déjà disponible');
        resolve();
        return;
      }

      console.log('📚 [DOCX] Création du script pour charger mammoth.js...');
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      script.onload = () => {
        console.log('📚 [DOCX] Script chargé, vérification de mammoth...');
        if ((window as any).mammoth) {
          console.log('✅ [DOCX] mammoth.js chargé avec succès');
          resolve();
        } else {
          console.error('❌ [DOCX] mammoth non disponible après chargement');
          reject(new Error(I18nService.t('SOP.shared.extraction.mammothJsLoadFailed')));
        }
      };
      script.onerror = (error) => {
        console.error('❌ [DOCX] Erreur lors du chargement du script:', error);
        reject(new Error(I18nService.t('SOP.shared.extraction.mammothJsLoadError')));
      };
      document.head.appendChild(script);
      console.log('📚 [DOCX] Script ajouté au DOM');
    });
  }

  async extractTextFromDoc(file: File): Promise<string> {
    console.log('📗 [DOC] Début extraction DOC (ancien format)');
    // Les fichiers .doc (ancien format) nécessitent une bibliothèque spécialisée
    // Pour l'instant, on suggère de convertir en .docx ou PDF
    try {
      console.log('📗 [DOC] Tentative de lecture comme fichier texte...');
      // Essayer d'utiliser FileReader pour lire comme texte (peu probable de fonctionner)
      const text = await this.readTextFile(file);
      console.log('📗 [DOC] Texte lu:', text.length, 'caractères');
      console.log('📗 [DOC] Contient null bytes?', text.includes('\0'));
      
      // Si on obtient du texte lisible, le retourner
      if (text && text.length > 50 && !text.includes('\0')) {
        console.log('📗 [DOC] Texte lisible trouvé, utilisation du texte extrait');
        return text;
      } else {
        console.warn('📗 [DOC] Texte non lisible ou trop court');
      }
    } catch (error) {
      console.error('❌ [DOC] Erreur lors de la lecture:', error);
      // Ignorer l'erreur et continuer
    }
    
    console.warn('📗 [DOC] Format .doc non supporté, suggestion de conversion');
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
          
          // Formater le texte et wrapper dans un conteneur pour préserver la mise en page
          let formattedHtml = this.formatDocumentText(this.documentContent);
          
          // Wrapper le contenu dans un div avec des styles pour préserver la mise en page
          formattedHtml = `<div class="document-wrapper" style="max-width: 100%; margin: 0 auto;">${formattedHtml}</div>`;
          
          // Sanitizer le HTML pour permettre les images base64 et styles inline
          const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, formattedHtml) || '';
          this.safeDocumentContent = this.sanitizer.bypassSecurityTrustHtml(sanitized);
          
          console.log('📄 [LOAD] Document chargé et HTML sécurisé créé');
          console.log('📄 [LOAD] Longueur HTML:', formattedHtml.length);
          this.showDocumentView = true;
        } else {
          // Si le document existe mais n'a pas de texte, ouvrir le modal d'upload
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

    console.log('📥 [DOWNLOAD] Début du téléchargement pour:', this.currentNodeId, this.currentOptionType);
    this.sopDocumentService.downloadDocument(this.currentNodeId, this.currentOptionType).subscribe({
      next: (blob: Blob) => {
        console.log('✅ [DOWNLOAD] Document téléchargé avec succès, taille:', blob.size, 'bytes');
        
        // Créer un lien de téléchargement
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Utiliser le nom du fichier du document ou générer un nom par défaut
        const fileName = this.documentTitle || `document_${this.currentNodeId}_${this.currentOptionType}`;
        link.download = fileName;
        
        // Déclencher le téléchargement
        document.body.appendChild(link);
        link.click();
        
        // Nettoyer
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        console.log('✅ [DOWNLOAD] Téléchargement terminé');
      },
      error: (error) => {
        console.error('❌ [DOWNLOAD] Erreur lors du téléchargement:', error);
        this.popupService.showError(
          I18nService.t('SOP.operation.documentOps.downloadErrorDetail', {
            error: error.message || I18nService.t('SOP.shared.popup.unknownError')
          }),
          I18nService.t('SOP.shared.popup.downloadError')
        );
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
      // Si un nouveau fichier est sélectionné, essayer d'extraire le texte
      let extractedText = this.editDocumentText;
      
      if (this.editDocumentFile) {
        try {
          const extracted = await this.extractTextFromFile(this.editDocumentFile);
          if (extracted && !this.isExtractionFailure(extracted)) {
            extractedText = extracted;
          }
        } catch (error) {
          console.error('Erreur lors de l\'extraction:', error);
          // Continuer avec le texte manuel
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
            // Recharger le document
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
          console.error('Erreur suppression:', response.error);
          await this.popupService.showError(response.error || I18nService.t('SOP.shared.documentOps.deleteError'), I18nService.t('SOP.shared.popup.deleteError'));
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la suppression:', error);
        // Vérifier si c'est une erreur 404 (document non trouvé)
        if (error.status === 404) {
          // Le document n'existe plus, fermer quand même la vue
          this.closeDocumentView();
          await this.popupService.showInfo(I18nService.t('SOP.shared.documentOps.alreadyDeleted'), I18nService.t('POPUP.info'));
        } else {
          await this.popupService.showError(
            I18nService.t('SOP.operation.documentOps.deleteErrorDetail', {
              error: error.error?.error || error.message || I18nService.t('SOP.shared.popup.unknownError')
            }),
            I18nService.t('SOP.shared.popup.deleteError')
          );
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

  // Ouvrir le modal d'ajout
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


  // Ajouter un nouveau titre/sous-titre
  private async addNode(newLabel: string): Promise<void> {
    if (!this.parentNodeForAdd || !newLabel.trim()) {
      return;
    }

    const newNodeId = this.generateId(newLabel);
    const parentNodeId = this.parentNodeForAdd.id === 'root' ? undefined : this.parentNodeForAdd.id;

    // Sauvegarder en base de données
    this.sopNodeService.createNode(newNodeId, newLabel, parentNodeId).subscribe({
      next: async (response) => {
        if (response.success) {
          // Recharger la structure depuis la base pour avoir la version à jour
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('SOP.shared.node.createdSuccess'), I18nService.t('POPUP.success'));
        } else {
          console.error('Erreur lors de la création:', response.error);
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

  // Ouvrir le modal de modification
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


  // Modifier un élément
  private async editNode(newLabel: string): Promise<void> {
    if (!this.nodeToEdit || !newLabel.trim()) {
      return;
    }

    // Sauvegarder en base de données
    this.sopNodeService.updateNode(this.nodeToEdit.id, newLabel).subscribe({
      next: async (response) => {
        if (response.success) {
          // Recharger la structure depuis la base pour avoir la version à jour
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('SOP.shared.node.updatedSuccess'), I18nService.t('POPUP.success'));
        } else {
          console.error('Erreur lors de la modification:', response.error);
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

  // Ouvrir le modal de suppression
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


  // Supprimer un élément
  private async deleteNode(): Promise<void> {
    if (!this.nodeToDelete) {
      return;
    }

    const nodeIdToDelete = this.nodeToDelete.id;

    // Sauvegarder en base de données
    this.sopNodeService.deleteNode(nodeIdToDelete).subscribe({
      next: async (response) => {
        if (response.success) {
          // Recharger la structure depuis la base pour avoir la version à jour
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('SOP.shared.node.deletedSuccess'), I18nService.t('POPUP.success'));
        } else {
          console.error('Erreur lors de la suppression:', response.error);
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

  // Trouver le parent d'un nœud
  private findParent(root: SOPNode, target: SOPNode): SOPNode | null {
    if (!root.children) {
      return null;
    }

    if (root.children.some(child => child.id === target.id)) {
      return root;
    }

    for (const child of root.children) {
      const found = this.findParent(child, target);
      if (found) {
        return found;
      }
    }

    return null;
  }

  // Générer un ID unique basé sur le label
  private generateId(label: string): string {
    return label.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Date.now();
  }

  formatDocumentText(text: string): string {
    if (!text) return '';
    
    // Vérifier si le texte contient déjà du HTML (venant de PDF ou DOCX)
    const hasHtmlTags = /<[^>]+>/g.test(text);
    const hasImages = /<img[^>]*>/gi.test(text);
    const hasInlineStyles = /style\s*=\s*["'][^"']*["']/gi.test(text);
    
    if (hasHtmlTags || hasImages || hasInlineStyles) {
      // Le texte contient déjà du HTML avec formatage, le retourner tel quel
      console.log('📄 [FORMAT] Texte contient déjà du HTML formaté, préservation complète');
      console.log('📄 [FORMAT] Contient images:', hasImages);
      console.log('📄 [FORMAT] Contient styles inline:', hasInlineStyles);
      // Retourner le HTML tel quel pour préserver la mise en forme exacte
      return text;
    }
    
    // Sinon, formater le texte brut en HTML
    console.log('📄 [FORMAT] Formatage du texte brut en HTML');
    
    // Échapper le HTML pour éviter les injections
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    // Détecter et formater les titres (lignes en majuscules ou avec des caractères spéciaux)
    escaped = escaped.replace(/^([A-Z\s\-–—]+)$/gm, '<h3 class="document-title">$1</h3>');
    
    // Détecter les sections numérotées (1., 2., etc.)
    escaped = escaped.replace(/^(\d+\.\s+[^\n]+)$/gm, '<h4 class="document-section">$1</h4>');
    
    // Détecter les sous-sections avec astérisques ou tirets
    escaped = escaped.replace(/^(\s*[\*\-\•]\s+[^\n]+)$/gm, '<div class="document-item">$1</div>');
    
    // Détecter les textes en gras (entre ** ou entourés de caractères spéciaux)
    escaped = escaped.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    
    // Formater les paragraphes (séparés par des lignes vides)
    escaped = escaped.split(/\n\n+/).map(para => {
      if (para.trim() && !para.includes('<h3') && !para.includes('<h4') && !para.includes('<div class="document-item"')) {
        return `<p class="document-paragraph">${para.trim().replace(/\n/g, '<br>')}</p>`;
      }
      return para;
    }).join('');
    
    // Formater les sauts de ligne simples
    escaped = escaped.replace(/\n/g, '<br>');
    
    return escaped;
  }

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

