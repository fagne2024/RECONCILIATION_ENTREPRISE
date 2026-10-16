import { Component, OnInit, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { SopDocumentService } from '../../services/sop-document.service';
import { SopNodeService } from '../../services/sop-node.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';

interface GuideNode {
  id: string;
  label: string;
  /** Clé i18n du libellé : permet de retrancher le texte sans figer la langue. */
  labelKey?: string;
  children?: GuideNode[];
  route?: string;
  description?: string;
}

/**
 * Marqueurs d'échec renvoyés par les extracteurs de texte.
 *
 * Ces chaînes ne sont jamais affichées à l'utilisateur : elles constituent un
 * protocole interne, repéré par les tests `.includes(...)` de `tryExtractText` et
 * `uploadDocument`. Elles restent donc volontairement rédigées en français, afin
 * que ces tests continuent de fonctionner quelle que soit la langue du
 * catalogue. Le message réellement présenté vient de `EXTRACTION_MESSAGE_KEYS`.
 */
const EXTRACTION_FAILURE = {
  NOT_SUPPORTED_TYPE: 'Texte non extrait automatiquement pour ce type de fichier. Veuillez saisir le texte manuellement.',
  OCR_UNAVAILABLE: 'OCR non disponible. Veuillez installer Tesseract.js pour extraire le texte des images.',
  IMAGE_ERROR: 'Erreur lors de l\'extraction du texte de l\'image',
  PDF_UNAVAILABLE: 'Extraction PDF non disponible. Veuillez saisir le texte manuellement ou installer pdf.js.',
  PDF_ERROR: 'Erreur lors de l\'extraction du texte du PDF. Veuillez saisir le texte manuellement.',
  WORD_UNAVAILABLE: 'Extraction Word (.docx) non disponible. Veuillez saisir le texte manuellement ou convertir en PDF.',
  WORD_ERROR: 'Erreur lors de l\'extraction du texte du document Word. Veuillez saisir le texte manuellement.',
  DOC_CONVERSION_NEEDED: 'Les fichiers .doc (ancien format Word) nécessitent une conversion. Veuillez convertir le fichier en .docx ou PDF, ou saisir le texte manuellement.'
};

/** Table de correspondance : premier marqueur trouvé gagne, du plus spécifique au plus large. */
const EXTRACTION_MESSAGE_KEYS: Array<[string, string]> = [
  [EXTRACTION_FAILURE.IMAGE_ERROR, 'GUD.extraction.imageError'],
  [EXTRACTION_FAILURE.PDF_ERROR, 'GUD.extraction.pdfError'],
  [EXTRACTION_FAILURE.WORD_ERROR, 'GUD.extraction.wordError'],
  [EXTRACTION_FAILURE.PDF_UNAVAILABLE, 'GUD.extraction.pdfUnavailable'],
  [EXTRACTION_FAILURE.WORD_UNAVAILABLE, 'GUD.extraction.wordUnavailable'],
  [EXTRACTION_FAILURE.OCR_UNAVAILABLE, 'GUD.extraction.ocrUnavailable'],
  [EXTRACTION_FAILURE.NOT_SUPPORTED_TYPE, 'GUD.extraction.notSupportedType'],
  [EXTRACTION_FAILURE.DOC_CONVERSION_NEEDED, 'GUD.extraction.docConversionNeeded']
];

/** Identifiant du nœud racine servi par l'API, seul nœud dont le libellé est i18n-isé. */
const ROOT_NODE_ID = 'root';

@Component({
  selector: 'app-guide-utilisation',
  templateUrl: './guide-utilisation.component.html',
  styleUrls: ['./guide-utilisation.component.scss']
})
export class GuideUtilisationComponent implements OnInit {
  Math = Math; // Rendre Math disponible dans le template
  selectedNode: GuideNode | null = null;
  showPopup: boolean = false;
  popupNode: GuideNode | null = null;
  
  // Variables pour les opérations
  parentNodeForAdd: GuideNode | null = null;
  nodeToEdit: GuideNode | null = null;
  nodeToDelete: GuideNode | null = null;
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

  readonly pageSizeOptions: number[] = [5, 10, 20, 50];

  guideStructure: GuideNode = {
    id: ROOT_NODE_ID,
    label: 'Visualisation des Guides',
    labelKey: 'GUD.tree.root',
    children: []
  };

  // Pagination
  currentPage: number = 1;
  itemsPerPage: number = 10;
  totalPages: number = 1;
  paginatedGuides: GuideNode[] = [];

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
    console.log('🔄 Chargement de la structure des guides...');
    
    this.sopNodeService.getGuideStructure().subscribe({
      next: (response) => {
        console.log('📦 Réponse reçue:', response);
        
        if (response.success && response.structure) {
          this.guideStructure = {
            id: response.structure.id,
            label: response.structure.label,
            labelKey: response.structure.id === ROOT_NODE_ID ? 'GUD.tree.root' : undefined,
            children: response.structure.children ? [...response.structure.children] : []
          };
          
          console.log('✅ Structure chargée avec succès:', this.guideStructure);
          console.log('📊 Nombre de guides:', this.guideStructure.children?.length || 0);
          
          // Calculer la pagination
          this.updatePagination();
          
          // Afficher un message si aucune donnée
          if (!this.guideStructure.children || this.guideStructure.children.length === 0) {
            console.warn('⚠️ Aucun guide trouvé dans la base de données');
            this.popupService.showInfo(
              I18nService.t('GUD.empty.dbPopup'),
              I18nService.t('POPUP.info')
            );
          }
        } else {
          console.error('❌ La réponse ne contient pas de structure valide:', response);
        }
        
        this.isLoadingStructure = false;
      },
      error: (error) => {
        console.error('❌ Erreur lors du chargement de la structure:', error);
        console.error('Détails de l\'erreur:', {
          status: error.status,
          statusText: error.statusText,
          message: error.message,
          url: error.url
        });
        
        this.popupService.showError(
          I18nService.t('GUD.load.connectionError'),
          I18nService.t('GUD.load.connectionErrorTitle')
        );
        
        this.isLoadingStructure = false;
      }
    });
  }

  /** Traduit un marqueur d'échec d'extraction en message affichable ; chaîne vide si absent. */
  private extractionFailureMessage(text: string): string {
    if (!text) {
      return '';
    }
    const match = EXTRACTION_MESSAGE_KEYS.find(([marker]) => text.includes(marker));
    return match ? I18nService.t(match[1]) : '';
  }

  onNodeClick(node: GuideNode, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    
    if (node.children && node.children.length > 0) {
      this.selectedNode = node;
    } else {
      this.popupNode = node;
      this.showPopup = true;
    }
  }

  closePopup(): void {
    this.showPopup = false;
    this.popupNode = null;
  }

  onOptionClick(option: string): void {
    if (!this.popupNode) return;
    
    this.sopDocumentService.checkGuideDocumentExists(this.popupNode.id, option).subscribe({
      next: (response) => {
        if (response.exists) {
          this.loadDocument(this.popupNode!.id, option);
        } else {
          this.openUploadModal(this.popupNode!.id, option);
        }
        this.closePopup();
      },
      error: (error) => {
        console.error('Erreur lors de la vérification du document:', error);
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
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.uploadError = '';
      this.manualText = '';
      this.showManualTextInput = false;
      
      if (this.selectedFile) {
        await this.tryExtractText();
      }
    }
  }

  async tryExtractText(): Promise<void> {
    if (!this.selectedFile) return;
    
    this.isExtractingText = true;
    this.uploadError = '';
    
    try {
      const extractedText = await this.extractTextFromFile(this.selectedFile);
      
      const isError = extractedText.includes('non disponible') || 
                     extractedText.includes('non extrait automatiquement') ||
                     extractedText.includes('Erreur lors de l\'extraction') ||
                     extractedText.includes('nécessitent');
      
      if (extractedText && !isError) {
        this.manualText = extractedText;
        this.showManualTextInput = true;
      } else {
        this.showManualTextInput = true;
        this.uploadError = this.extractionFailureMessage(extractedText) ||
          I18nService.t('GUD.errors.autoUnavailable');
      }
    } catch (error) {
      console.error('Erreur lors de l\'extraction:', error);
      this.showManualTextInput = true;
      this.uploadError = I18nService.t('GUD.errors.autoImpossible');
    } finally {
      this.isExtractingText = false;
    }
  }

  toggleManualTextInput(): void {
    // Called by checkbox
  }

  async uploadDocument(): Promise<void> {
    if (!this.selectedFile || !this.uploadNodeId || !this.uploadOptionType) {
      this.uploadError = I18nService.t('GUD.errors.noFile');
      return;
    }

    let extractedText = this.manualText.trim();
    
    if (!extractedText) {
      try {
        extractedText = await this.extractTextFromFile(this.selectedFile);
        if (extractedText.includes('non disponible') || 
            extractedText.includes('non extrait automatiquement') ||
            extractedText.includes('Erreur lors de l\'extraction') ||
            extractedText.includes('nécessitent')) {
          this.uploadError = this.extractionFailureMessage(extractedText) ||
            I18nService.t('GUD.errors.noTextBelowField');
          this.showManualTextInput = true;
          return;
        }
      } catch (error) {
        console.error('Erreur lors de l\'extraction:', error);
        this.uploadError = I18nService.t('GUD.errors.noTextManually');
        this.showManualTextInput = true;
        return;
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      this.uploadError = I18nService.t('GUD.errors.noTextOrExtractableFile');
      this.showManualTextInput = true;
      return;
    }

    this.isUploading = true;
    this.uploadError = '';

    this.sopDocumentService.uploadGuideDocument(
      this.selectedFile,
      this.uploadNodeId,
      this.uploadOptionType,
      extractedText
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.loadDocument(this.uploadNodeId, this.uploadOptionType);
          this.closeUploadModal();
        } else {
          this.uploadError = response.error || I18nService.t('GUD.errors.uploadFailed');
        }
        this.isUploading = false;
      },
      error: (error) => {
        console.error('Erreur lors de l\'upload:', error);
        this.uploadError = I18nService.t('GUD.errors.uploadDocumentFailed');
        this.isUploading = false;
      }
    });
  }

  async extractTextFromFile(file: File): Promise<string> {
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    if (fileType.startsWith('image/') || fileName.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/i)) {
      return await this.extractTextFromImage(file);
    }
    
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return await this.extractTextFromPdf(file);
    }

    if (fileType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      return await this.readTextFile(file);
    }

    if (fileName.endsWith('.docx')) {
      return await this.extractTextFromDocx(file);
    }
    
    if (fileName.endsWith('.doc')) {
      return await this.extractTextFromDoc(file);
    }

    return EXTRACTION_FAILURE.NOT_SUPPORTED_TYPE;
  }

  async extractTextFromImage(file: File): Promise<string> {
    try {
      const Tesseract = (window as any).Tesseract;
      if (Tesseract) {
        const { data: { text } } = await Tesseract.recognize(file);
        return text;
      } else {
        return EXTRACTION_FAILURE.OCR_UNAVAILABLE;
      }
    } catch (error) {
      console.error('Erreur OCR:', error);
      return EXTRACTION_FAILURE.IMAGE_ERROR;
    }
  }

  async extractTextFromPdf(file: File): Promise<string> {
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      
      if (pdfjsLib) {
        const arrayBuffer = await file.arrayBuffer();
        
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let htmlContent = '';

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({
            canvasContext: context!,
            viewport: viewport
          }).promise;
          
          const pageImage = canvas.toDataURL('image/png');
          
          htmlContent += `<div class="pdf-page" style="text-align: center; margin-bottom: 30px;">
            <img src="${pageImage}" alt="${I18nService.t('GUD.extraction.pageAlt', { page: i })}" style="max-width: 100%; height: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px;" />
          </div>\n`;
        }

        return htmlContent.trim() || I18nService.t('GUD.extraction.pdfNoText');
      } else {
        try {
          await this.loadPdfJs();
          return await this.extractTextFromPdf(file);
        } catch (loadError) {
          return EXTRACTION_FAILURE.PDF_UNAVAILABLE;
        }
      }
    } catch (error) {
      console.error('Erreur extraction PDF:', error);
      return EXTRACTION_FAILURE.PDF_ERROR;
    }
  }

  async loadPdfJs(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        if ((window as any).pdfjsLib) {
          (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve();
        } else {
          reject(new Error(I18nService.t('GUD.extraction.pdfJsLoadFailed')));
        }
      };
      script.onerror = (error) => {
        reject(new Error(I18nService.t('GUD.extraction.pdfJsLoadError')));
      };
      document.head.appendChild(script);
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
    try {
      const mammoth = (window as any).mammoth;
      
      if (mammoth) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        return result.value || I18nService.t('GUD.extraction.wordNoText');
      } else {
        try {
          await this.loadMammothJs();
          return await this.extractTextFromDocx(file);
        } catch (loadError) {
          return EXTRACTION_FAILURE.WORD_UNAVAILABLE;
        }
      }
    } catch (error) {
      console.error('Erreur extraction .docx:', error);
      return EXTRACTION_FAILURE.WORD_ERROR;
    }
  }

  async loadMammothJs(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).mammoth) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
      script.onload = () => {
        if ((window as any).mammoth) {
          resolve();
        } else {
          reject(new Error(I18nService.t('GUD.extraction.mammothJsLoadFailed')));
        }
      };
      script.onerror = (error) => {
        reject(new Error(I18nService.t('GUD.extraction.mammothJsLoadError')));
      };
      document.head.appendChild(script);
    });
  }

  async extractTextFromDoc(file: File): Promise<string> {
    try {
      const text = await this.readTextFile(file);
      if (text && text.length > 50 && !text.includes('\0')) {
        return text;
      }
    } catch (error) {
      console.error('Erreur lors de la lecture:', error);
    }
    
    return EXTRACTION_FAILURE.DOC_CONVERSION_NEEDED;
  }

  loadDocument(nodeId: string, optionType: string): void {
    this.sopDocumentService.getGuideDocumentContent(nodeId, optionType).subscribe({
      next: (response) => {
        if (response.exists && response.extractedText) {
          this.documentContent = response.extractedText;
          this.documentTitle = response.fileName || I18nService.t('GUD.document.defaultName');
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
      return;
    }

    this.sopDocumentService.downloadGuideDocument(this.currentNodeId, this.currentOptionType).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = this.documentTitle || `guide_${this.currentNodeId}_${this.currentOptionType}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
      error: (error) => {
        console.error('Erreur lors du téléchargement:', error);
        this.popupService.showError(
          I18nService.t('GUD.document.downloadError'),
          I18nService.t('GUD.document.downloadErrorTitle')
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
      let extractedText = this.editDocumentText;
      
      if (this.editDocumentFile) {
        try {
          const extracted = await this.extractTextFromFile(this.editDocumentFile);
          if (extracted && 
              !extracted.includes('non disponible') && 
              !extracted.includes('non extrait automatiquement') &&
              !extracted.includes('Erreur lors de l\'extraction')) {
            extractedText = extracted;
          }
        } catch (error) {
          console.error('Erreur lors de l\'extraction:', error);
        }
      }

      this.sopDocumentService.updateGuideDocument(
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
            this.popupService.showError(
              response.error || I18nService.t('GUD.docOps.updateError'),
              I18nService.t('GUD.docOps.updateErrorTitle')
            );
          }
          this.isEditingDocument = false;
        },
        error: (error) => {
          console.error('Erreur lors de la modification:', error);
          this.popupService.showError(
            I18nService.t('GUD.docOps.updateErrorGeneric'),
            I18nService.t('GUD.docOps.updateErrorTitle')
          );
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
    
    const message = I18nService.t('GUD.docOps.confirmDelete', { name: this.documentTitle });
    const confirmed = await this.popupService.showConfirm(message, I18nService.t('GUD.docOps.confirmDeleteTitle'));
    
    if (confirmed) {
      await this.deleteDocument();
    }
  }

  private async deleteDocument(): Promise<void> {
    if (!this.currentNodeId || !this.currentOptionType) {
      return;
    }

    this.sopDocumentService.deleteGuideDocument(
      this.currentNodeId,
      this.currentOptionType
    ).subscribe({
      next: async (response) => {
        if (response.success) {
          this.closeDocumentView();
          await this.popupService.showSuccess(I18nService.t('GUD.docOps.deletedSuccess'), I18nService.t('POPUP.success'));
        } else {
          await this.popupService.showError(
            response.error || I18nService.t('GUD.docOps.deleteError'),
            I18nService.t('GUD.docOps.deleteErrorTitle')
          );
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la suppression:', error);
        if (error.status === 404) {
          this.closeDocumentView();
          await this.popupService.showInfo(I18nService.t('GUD.docOps.alreadyDeleted'), I18nService.t('POPUP.info'));
        } else {
          await this.popupService.showError(
            I18nService.t('GUD.docOps.deleteErrorGeneric'),
            I18nService.t('GUD.docOps.deleteErrorTitle')
          );
        }
      }
    });
  }

  hasChildren(node: GuideNode): boolean {
    return node.children && node.children.length > 0;
  }

  async openAddModal(node: GuideNode, event: Event): Promise<void> {
    event.stopPropagation();
    this.parentNodeForAdd = node;
    
    const label = await this.popupService.showTextInput(
      I18nService.t('GUD.nodes.addPrompt'),
      I18nService.t('GUD.nodes.addTitle'),
      '',
      I18nService.t('GUD.nodes.addPlaceholder')
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
    // CORRECTION: Toujours envoyer l'ID du parent, même si c'est 'root'
    const parentNodeId = this.parentNodeForAdd.id;

    console.log('📝 Création du guide:', { newNodeId, newLabel, parentNodeId });

    this.sopNodeService.createGuideNode(newNodeId, newLabel, parentNodeId).subscribe({
      next: async (response) => {
        if (response.success) {
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('GUD.nodes.createdSuccess'), I18nService.t('POPUP.success'));
        } else {
          await this.popupService.showError(
            I18nService.t('GUD.nodes.createdErrorDetail', {
              error: response.error || I18nService.t('GUD.errors.unknownError')
            }),
            I18nService.t('GUD.nodes.createdErrorTitle')
          );
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la création:', error);
        await this.popupService.showError(
          I18nService.t('GUD.nodes.createdError'),
          I18nService.t('GUD.nodes.createdErrorTitle')
        );
      }
    });
  }

  async openEditModal(node: GuideNode, event: Event): Promise<void> {
    event.stopPropagation();
    this.nodeToEdit = node;
    
    const newLabel = await this.popupService.showTextInput(
      I18nService.t('GUD.nodes.editPrompt'),
      I18nService.t('GUD.nodes.editTitle'),
      node.label,
      I18nService.t('GUD.nodes.editPlaceholder')
    );
    
    if (newLabel && newLabel.trim() && newLabel.trim() !== node.label) {
      await this.editNode(newLabel.trim());
    }
  }

  private async editNode(newLabel: string): Promise<void> {
    if (!this.nodeToEdit || !newLabel.trim()) {
      return;
    }

    this.sopNodeService.updateGuideNode(this.nodeToEdit.id, newLabel).subscribe({
      next: async (response) => {
        if (response.success) {
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('GUD.nodes.updatedSuccess'), I18nService.t('POPUP.success'));
        } else {
          await this.popupService.showError(
            I18nService.t('GUD.nodes.updatedErrorDetail', {
              error: response.error || I18nService.t('GUD.errors.unknownError')
            }),
            I18nService.t('GUD.nodes.updatedErrorTitle')
          );
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la modification:', error);
        await this.popupService.showError(
          I18nService.t('GUD.nodes.updatedError'),
          I18nService.t('GUD.nodes.updatedErrorTitle')
        );
      }
    });
  }

  async openDeleteModal(node: GuideNode, event: Event): Promise<void> {
    event.stopPropagation();
    this.nodeToDelete = node;
    
    let message = I18nService.t('GUD.nodes.deleteMessage', { name: node.label });
    if (node.children && node.children.length > 0) {
      message += I18nService.t('GUD.nodes.deleteChildrenWarning', { count: node.children.length });
    }
    
    const confirmed = await this.popupService.showConfirm(message, I18nService.t('GUD.docOps.confirmDeleteTitle'));
    
    if (confirmed) {
      await this.deleteNode();
    }
  }

  private async deleteNode(): Promise<void> {
    if (!this.nodeToDelete) {
      return;
    }

    const nodeIdToDelete = this.nodeToDelete.id;

    this.sopNodeService.deleteGuideNode(nodeIdToDelete).subscribe({
      next: async (response) => {
        if (response.success) {
          this.loadStructure();
          await this.popupService.showSuccess(I18nService.t('GUD.nodes.deletedSuccess'), I18nService.t('POPUP.success'));
        } else {
          await this.popupService.showError(
            I18nService.t('GUD.nodes.deletedErrorDetail', {
              error: response.error || I18nService.t('GUD.errors.unknownError')
            }),
            I18nService.t('GUD.nodes.deletedErrorTitle')
          );
        }
      },
      error: async (error) => {
        console.error('Erreur lors de la suppression:', error);
        await this.popupService.showError(
          I18nService.t('GUD.nodes.deletedError'),
          I18nService.t('GUD.nodes.deletedErrorTitle')
        );
      }
    });
  }

  private findParent(root: GuideNode, target: GuideNode): GuideNode | null {
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

  escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Méthodes de pagination
  get rangeLabel(): string {
    const total = this.guideStructure.children?.length || 0;
    const from = total === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
    const to = Math.min(this.currentPage * this.itemsPerPage, total);
    return I18nService.t('GUD.pagination.info', { from, to, total });
  }

  updatePagination(): void {
    const children = this.guideStructure.children || [];
    this.totalPages = Math.ceil(children.length / this.itemsPerPage);
    
    // S'assurer que currentPage est valide
    if (this.currentPage > this.totalPages) {
      this.currentPage = Math.max(1, this.totalPages);
    }
    
    // Calculer les guides à afficher pour la page actuelle
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.paginatedGuides = children.slice(startIndex, endIndex);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  get pageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    
    if (this.totalPages <= maxPagesToShow) {
      // Afficher toutes les pages si le nombre est petit
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Afficher les pages avec ellipses
      const halfRange = Math.floor(maxPagesToShow / 2);
      let startPage = Math.max(1, this.currentPage - halfRange);
      let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);
      
      // Ajuster si on est près de la fin
      if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  changeItemsPerPage(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.itemsPerPage = parseInt(select.value, 10);
    this.currentPage = 1; // Retour à la première page
    this.updatePagination();
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
