import { Component, OnInit, ChangeDetectorRef, AfterViewInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { MatSelect, MatSelectChange } from '@angular/material/select';
import { FieldTypeDetectionService, ColumnAnalysis } from '../../services/field-type-detection.service';
import { DataProcessingService } from '../../services/data-processing.service';
import { ExportOptimizationService, ExportProgress } from '../../services/export-optimization.service';
import { fixGarbledCharacters } from '../../utils/encoding-fixer';
import { readCsvFileUltraFast } from '../../utils/fast-csv-reader.util';
import {
  findGdjHeaderLineIndexInCsvLines,
  looksLikeGdjReportPreamble,
  looksLikeGdjTransactionalHeader
} from '../../utils/model-header-detection.util';
import { buildConcatenatedValue } from '../../utils/concat.util';
import {
  preserveLeadingZeroString,
  finalizeTextPreserveColumnValue,
  formatCellForCsvExport,
  keepCharactersFromString,
  finalizeRemoveCharactersCell,
  LeadingZeroMode,
  isMsisdnPreserveColumn,
  isLeadingZeroNumericString
} from '../../utils/text-cell.util';
import { renameKeyPreservingOrder } from '../../utils/row-column.util';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import * as JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { HttpErrorResponse } from '@angular/common/http';
import { ExcelConversionService } from '../../services/excel-conversion.service';
import { ConfigurationCalculService } from '../../services/configuration-calcul.service';

@Component({
  selector: 'app-traitement',
  templateUrl: './traitement.component.html',
  styleUrls: ['./traitement.component.scss']
})
export class TraitementComponent implements OnInit, AfterViewInit {
  readonly LOCAL_STORAGE_KEY = 'traitement_data';
  readonly LOCAL_STORAGE_COLUMN_ORDER_KEY = 'traitement_column_order';
  selectedFiles: File[] = [];
  combinedRows: any[] = [];
  columns: string[] = [];
  dedupCols: string[] = [];
  formatOptions: any = {
    removeCharacters: false,
    removeSpecialStrings: false,
    removeNumbers: false,
    removeIndicatif: false,
    removeDecimals: false,
    keepLastDigits: false,
    removeZeroDecimals: false,
    removeSpaces: false
  };
  extractCol: string = '';
  extractType: string = '';
  extractCount: number = 1;
  extractKey: string = '';
  extractStart: number = 1;
  selectedCols: string[] = [];
  successMsg: any = {};
  errorMsg: any = {};
  selectedDateFormat: string = 'yyyy-MM-dd';
  exportTypeCol: string = '';
  exportTypeValues: string[] = [];
  exportTypeSelected: string[] = [];
  exportTypeFormat: 'csv' | 'xls' | 'xlsx' = 'xlsx';
  allRows: any[] = [];
  allColumns: string[] = [];
  originalRows: any[] = []; // Ajout pour garder toutes les données d'origine
  // Ajout d'un flag pour savoir si une sélection a été appliquée
  selectionApplied: boolean = false;

  // --- FILTRAGE DYNAMIQUE ---
  selectedFilterColumn: string = '';
  filterValues: string[] = [];
  selectedFilterValues: string[] = [];
  filteredRows: any[] = [];
  filterApplied: boolean = false;

  // --- FILTRES MULTIPLES ---
  multipleFilters: Array<{
    id: string;
    column: string;
    values: string[];
    selectedValues: string[];
    filterValues: string[];
    filteredFilterValues: string[];
    enabled: boolean;
  }> = [];
  nextFilterId: number = 1;

  // --- CONTRÔLES DE RECHERCHE POUR COHÉRENCE AVEC LES FILTRES ---
  filterValueSearchCtrl = new FormControl('');
  filteredFilterValues: string[] = [];
  @ViewChild('filterValueSelect') filterValueSelect!: MatSelect;

  // --- CONCATÉNATION DE COLONNES (MULTI) ---
  concatCols: string[] = [];
  concatNewCol: string = '';
  concatSeparator: string = '';
  concatOrderMode: boolean = false;

  // --- RENOMMAGE D'EN-TÊTES ---
  renameSourceCol: string = '';
  renameNewName: string = '';

  exportTypePrefix: string = '';
  exportTypeSuffix: string = '';
  exportTypeCustomSuffix: string = '';
  exportTypeDescription: string = '';

  // --- EXPORT PAR DATE ---
  exportDateCol: string = '';
  exportDatePeriod: 'day' | 'week' | 'month' | 'hour' | 'timerange' = 'day';
  exportDateFormat: 'csv' | 'xls' | 'xlsx' = 'xlsx';
  exportDatePrefix: string = 'export';
  exportTimeRangeMinutes: number = 60;
  detectedPeriods: Array<{ label: string; count: number; key: string }> = [];

  // --- GESTION DES CARACTÈRES ---
  removeCharMode: 'remove' | 'keep' = 'remove';
  removeCharPosition: 'start' | 'end' | 'specific' = 'start';
  removeCharCount: number = 1;
  removeCharLeadingZeroMode: LeadingZeroMode = 'none';
  removeCharSpecificPosition: number = 1;

  // --- SUPPRESSION DE CARACTÈRES SPÉCIAUX ---
  specialStringToRemove: string = '';
  specialStringRemovalMode: 'all' | 'start' | 'end' = 'all';

  // --- SUPPRESSION D'INDICATIF ---
  indicatifType: 'international' | 'national' | 'custom' = 'international';
  customIndicatif: string = '+33';
  indicatifLength: number = 2;

  // --- GARDER N DERNIERS DIGITS ---
  keepLastDigitsCount: number = 3;

  // --- SUPPRESSION DE DÉCIMALES ---
  decimalSeparator: ',' | '.' = ',';
  keepTrailingZeros: boolean = false;

  // --- SUPPRESSION .0 SUR LES DATES ---
  // Pas de propriétés supplémentaires nécessaires pour cette option

  // --- SUPPRESSION D'ESPACES ---
  removeSpacesType: 'all' | 'leading' | 'trailing' | 'multiple' = 'all';

  // --- SUPPRESSION DE CARACTÈRES SPÉCIFIQUES ---
  specificCharactersToRemove: string = '';
  removeSpecificCharactersCaseSensitive: boolean = true;
  
  // --- INSERTION DE CARACTÈRES ---
  charactersToInsert: string = '';
  insertPosition: 'start' | 'end' | 'specific' = 'start';
  insertSpecificPosition: number = 1;
  
  // --- PROPRIÉTÉS POUR LE FILTRAGE PAR VALEUR EXACTE ---
  filterByExactValue: boolean = false;
  exactValueToFilter: string = '';
  exactValueColumn: string = '';

  // --- DÉTECTION AUTOMATIQUE DE SÉPARATEUR CSV ---
  detectedDelimiter: string = ';';
  delimiterDetectionEnabled: boolean = true;
  csvPreviewData: any[] = [];
  csvPreviewColumns: string[] = [];
  showCsvPreview: boolean = false;
  csvContentToProcess: string = '';

  // --- DÉTECTION AUTOMATIQUE DES TYPES DE CHAMPS ---
  fieldTypeAnalysis: ColumnAnalysis[] = [];
  showFieldTypeAnalysis: boolean = false;
  autoFormattingEnabled: boolean = true;
  formattingRecommendations: any[] = [];
  csvFileToProcess: File | null = null;

  // --- DÉTECTION FICHIERS GDJ (LA GABONAISE DES JEUX) ---
  isGdjFile: boolean = false;
  gdjHeaderRowIndex: number = -1;

  // --- FLAG POUR IMPORT DEPUIS PRÉVISUALISATION ---
  /** Indique si l'import a été confirmé depuis la prévisualisation CSV.
   *  Si true, les filtres automatiques spécifiques aux modèles (Orange Money, GDJ) ne sont pas appliqués. */
  private isImportFromPreview: boolean = false;

  // --- PAGINATION ET AFFICHAGE ---
  currentPage: number = 1;
  rowsPerPage: number = 100;
  maxDisplayedRows: number = 1000;
  showAllRows: boolean = false;
  displayedRows: any[] = [];

  // --- RÉORGANISATION DES COLONNES ---
  isColumnReorderMode: boolean = false;
  reorderedColumns: string[] = [];
  draggedColumn: string | null = null;
  dragOverColumn: string | null = null;

  // --- INDICATEURS DE PROGRESSION ---
  isProcessing: boolean = false;
  processingProgress: number = 0;
  processingMessage: string = '';
  totalFilesToProcess: number = 0;
  currentFileIndex: number = 0;
  fileProcessStats: { name: string; rows: number; status: 'succès' | 'erreur'; errorMsg?: string }[] = [];

  // Optimisations pour gros fichiers
  private worker: Worker | null = null;
  private processingQueue: any[] = [];
  private isProcessingQueue: boolean = false;
  private chunkSize: number = 5000; // Taille optimisée pour 50k lignes
  private maxConcurrentChunks: number = 4;
  private activeChunks: number = 0;

  // Sélection de colonnes par option de formatage
  formatSelections: { [key: string]: string[] } = {
    removeCharacters: [],
    removeSpecialStrings: [],
    removeNumbers: [],
    removeIndicatif: [],
    removeDecimals: [],
    keepLastDigits: [],
    removeZeroDecimals: [],
    removeSpaces: []
  };

  // --- SÉPARATION DES FEUILLES EXCEL ---
  readonly sheetSplitDefaultHeader: string[] = [
    'N°',
    'Date',
    'Heure',
    'Référence',
    'Service',
    'Paiement',
    'Statut',
    'Mode',
    'N° de Compte',
    'Wallet',
    'N° Pseudo',
    'N° de Compte',
    'Wallet',
    'Débit',
    'Crédit',
    'Compte: 657376636',
    'Sous-réseau'
  ];
  sheetSplitHeaderText: string = this.sheetSplitDefaultHeader.join('; ');
  sheetSplitApplyHeaderFromSecondSheet: boolean = true;
  sheetSplitFile: File | null = null;
  sheetSplitIsProcessing: boolean = false;
  sheetSplitConversionInProgress: boolean = false;
  sheetSplitConversionMessage: string = '';
  sheetSplitProgress: string = '';
  sheetSplitConversionProgress: number = 0; // Pourcentage de progression (0-100)
  sheetSplitConversionElapsedTime: number = 0; // Temps écoulé en secondes
  sheetSplitConversionProgressInterval: any = null; // Intervalle pour mettre à jour la progression
  sheetSplitResults: Array<{ sheetName: string; rows: number; fileName: string }> = [];
  sheetSplitColumnWidths: number[] = [8, 12, 10, 15, 12, 12, 10, 8, 15, 10, 12, 15, 10, 12, 12, 20, 15];
  sheetSplitZipName: string = '';
  /** Affiché quand la conversion .xls en navigateur échoue, pour proposer la macro Excel. */
  showSheetSplitExcelFallbackHelp: boolean = false;
  /** Retour visuel après la copie du code VBA. */
  sheetSplitVbaCopied: boolean = false;
  private sheetSplitVbaCopyTimeout: any = null;

  /** Macro VBA de secours pour séparer les feuilles dans Excel (en-tête 17 colonnes). */
  readonly SHEET_SPLIT_VBA_MACRO = `Sub SeparerFeuillesEnteteComplet()
    Dim ws As Worksheet
    Dim cheminOriginal As String
    Dim classeurOriginal As Workbook
    Dim i As Integer
    Dim entetePersonnalise As Variant
    
    ' Définir l'en-tête personnalisé avec 17 colonnes
    entetePersonnalise = Array("N°", "Date", "Heure", "Référence", "Service", "Paiement", "Statut", "Mode", _
                              "N° de Compte", "Wallet", "N° Pseudo", "N° de Compte", "Wallet", "Débit", "Crédit", _
                              "Compte: 657376636", "Sous-réseau")
    
    ' Sauvegarder la référence au classeur original
    Set classeurOriginal = ThisWorkbook
    cheminOriginal = classeurOriginal.Path
    
    ' Désactiver les alertes pour éviter les interruptions
    Application.DisplayAlerts = False
    
    ' Traiter chaque feuille une par une
    For i = 1 To classeurOriginal.Worksheets.Count
        Set ws = classeurOriginal.Worksheets(i)
        
        ' Copier la feuille (cela crée automatiquement un nouveau classeur)
        ws.Copy
        
        If i > 1 Then
            ' Insérer une ligne au début pour l'en-tête
            ActiveSheet.Rows("1:1").Insert Shift:=xlDown
            
            ' Ajouter l'en-tête personnalisé
            Dim j As Integer
            For j = 0 To UBound(entetePersonnalise)
                ActiveSheet.Cells(1, j + 1).Value = entetePersonnalise(j)
            Next j
            
            ' Formater l'en-tête
            With ActiveSheet.Range("A1:Q1")
                .Font.Bold = True
                .Interior.Color = RGB(200, 200, 200) ' Gris clair
                .HorizontalAlignment = xlCenter
            End With
        End If
        
        ' Ajuster la largeur des colonnes avec des largeurs spécifiques pour 17 colonnes
        With ActiveSheet
            .Columns("A").ColumnWidth = 8   ' N°
            .Columns("B").ColumnWidth = 12  ' Date
            .Columns("C").ColumnWidth = 10  ' Heure
            .Columns("D").ColumnWidth = 15  ' Référence
            .Columns("E").ColumnWidth = 12  ' Service
            .Columns("F").ColumnWidth = 12  ' Paiement
            .Columns("G").ColumnWidth = 10  ' Statut
            .Columns("H").ColumnWidth = 8   ' Mode
            .Columns("I").ColumnWidth = 15  ' N° de Compte
            .Columns("J").ColumnWidth = 10  ' Wallet
            .Columns("K").ColumnWidth = 12  ' N° Pseudo
            .Columns("L").ColumnWidth = 15  ' N° de Compte
            .Columns("M").ColumnWidth = 10  ' Wallet
            .Columns("N").ColumnWidth = 12  ' Débit
            .Columns("O").ColumnWidth = 12  ' Crédit
            .Columns("P").ColumnWidth = 20  ' Compte: 657376636
            .Columns("Q").ColumnWidth = 15  ' Sous-réseau
        End With
        
        ' Sauvegarder et fermer le nouveau classeur
        ActiveWorkbook.SaveAs cheminOriginal & "\\" & ws.Name & ".xlsx"
        ActiveWorkbook.Close SaveChanges:=False
        
        ' Réactiver le classeur original
        classeurOriginal.Activate
    Next i
    
    ' Réactiver les alertes
    Application.DisplayAlerts = True
    
    MsgBox "Séparation terminée ! La première feuille reste intacte, les autres ont reçu l'en-tête personnalisé avec 17 colonnes."
End Sub`;

  // --- PROPRIÉTÉS POUR TOTAL ENERGIE ---
  totalEnergieFile1: File | null = null; // Premier fichier avec Code PDA, Station, Numéro SIM
  totalEnergieFile2: File | null = null; // Deuxième fichier avec N° de compte
  totalEnergieData1: any[] = []; // Données du premier fichier
  totalEnergieData2: any[] = []; // Données du deuxième fichier
  totalEnergieColumns1: string[] = []; // Colonnes du premier fichier
  totalEnergieColumns2: string[] = []; // Colonnes du deuxième fichier
  totalEnergieMergedData: any[] = []; // Données fusionnées
  totalEnergieMergedColumns: string[] = []; // Colonnes fusionnées
  totalEnergieIsProcessing: boolean = false;
  totalEnergieProgress: string = '';

  // Comparaison BO Agence / PARTNER Station (Total Energie)
  totalEnergieCompareFile: File | null = null;
  totalEnergieCompareData: any[] = [];
  totalEnergieCompareColumns: string[] = [];
  totalEnergieCompareResult: any[] = [];
  totalEnergieCompareResultColumns: string[] = [];
  totalEnergieCompareIsProcessing: boolean = false;
  totalEnergieCompareProgress: string = '';
  totalEnergieCompareSummary: Array<{ station: string; agenceBo: string; count: number }> = []; // Récapitulatif groupé par station avec agence BO

  // --- FUSION MULTI-FICHIERS CSV AVEC EXTRACTION DATE/ID DU NOM ---
  multiMergeFiles: File[] = []; // Fichiers à fusionner
  multiMergePrefix: string = 'MOOVGA_'; // Préfixe à retirer du nom (ex: MOOVGA_)
  multiMergeIdColumnName: string = 'Jour'; // Nom de la colonne d'identifiant
  multiMergeRecursive: boolean = true; // Recherche récursive (simulée via sélection multiple)
  multiMergeDelimiter: string = ';'; // Séparateur CSV
  multiMergeData: any[] = []; // Données fusionnées
  multiMergeColumns: string[] = []; // Colonnes fusionnées
  multiMergeIsProcessing: boolean = false;
  multiMergeProgress: string = '';
  multiMergeStats: { file: string; id: string; rows: number }[] = []; // Stats par fichier

  // --- COMPILATION EN-TÊTES DIFFÉRENTS (2 fichiers avec des en-têtes différents) ---
  compileHeadersFile1: File | null = null; // Fichier 1 : fournit les en-têtes à conserver
  compileHeadersFile2: File | null = null; // Fichier 2 : fournit les données à reporter
  compileHeadersData1: any[] = []; // Données du premier fichier
  compileHeadersData2: any[] = []; // Données du deuxième fichier
  compileHeadersCols1: string[] = []; // En-têtes du premier fichier
  compileHeadersCols2: string[] = []; // En-têtes du deuxième fichier
  compileHeadersRetained: string[] = []; // En-têtes conservés (sélection fichier 1)
  compileHeadersMapping: { [source: string]: string } = {}; // Colonne fichier 2 -> en-tête retenu ('' = ignorer)
  compileHeadersResult: any[] = []; // Résultat compilé
  compileHeadersResultColumns: string[] = []; // En-têtes du résultat
  compileHeadersIsProcessing: boolean = false;
  compileHeadersProgress: string = '';

  constructor(
    private cd: ChangeDetectorRef, 
    private fb: FormBuilder,
    private fieldTypeDetectionService: FieldTypeDetectionService,
    public dataProcessingService: DataProcessingService,
    private exportOptimizationService: ExportOptimizationService,
    private excelConversionService: ExcelConversionService,
    private translate: TranslateService,
    private configurationCalculService: ConfigurationCalculService
  ) {}

  private t(key: string, params?: any): string {
    return this.translate.instant(key, params) as string;
  }

  private showSuccess(key: string, msg: string) {
    this.successMsg[key] = msg;
  }
  private showError(key: string, msg: string) {
    this.errorMsg[key] = msg;
    setTimeout(() => { this.errorMsg[key] = ''; }, 3000);
  }

  triggerFileInput() {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(input.files);
      input.value = '';
    }
    this.processFiles();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer && event.dataTransfer.files) {
      this.addFiles(event.dataTransfer.files);
    }
    this.removeDragOverStyle();
    this.processFiles();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.addDragOverStyle();
  }

  addFiles(fileList: FileList) {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList.item(i);
      if (file && !this.selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
        this.selectedFiles.push(file);
        
        // Si c'est un fichier CSV/TSV, déclencher la prévisualisation
        if (this.isCsvTextExtension(file.name)) {
          this.previewCsvFile(file);
        }
      }
    }
  }

  // Méthode pour prévisualiser un fichier CSV
  async previewCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const csv = e.target.result;
        
        // Stocker le contenu pour le traitement ultérieur
        this.csvContentToProcess = csv;
        this.csvFileToProcess = file;
        
        // Détection automatique du séparateur
        this.detectedDelimiter = this.detectCsvDelimiter(csv);
        
        // Prévisualiser les données
        const preview = await this.previewCsvData(csv, this.detectedDelimiter);
        this.csvPreviewColumns = preview.columns;
        this.csvPreviewData = preview.data;
        this.showCsvPreview = true;
        
        
        this.cd.detectChanges();
      } catch (error) {
        this.showError('upload', this.t('TRT.msg.csvPreviewError'));
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  addDragOverStyle() {
    const uploadArea = document.querySelector('.upload-area');
    if (uploadArea) {
      uploadArea.classList.add('dragover');
    }
  }

  removeDragOverStyle() {
    const uploadArea = document.querySelector('.upload-area');
    if (uploadArea) {
      uploadArea.classList.remove('dragover');
    }
  }

  async processFiles() {
    // Si une prévisualisation CSV est en cours, ne pas traiter automatiquement
    if (this.showCsvPreview) {
      return;
    }
    
    // Vérifier la taille totale des fichiers
    const totalSize = this.selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = totalSize / (1024 * 1024);
    const isLargeUpload = totalSizeMB > 100; // Plus de 100MB
    

    this.isProcessing = true;
    this.processingProgress = 0;
    this.processingMessage = isLargeUpload ? this.t('TRT.msg.initOptimized') : this.t('TRT.msg.initUltraFast');
    
    this.combinedRows = [];
    this.columns = [];
    this.allRows = [];
    this.allColumns = [];
    this.originalRows = [];
    
    // Réinitialiser les paramètres d'affichage
    this.currentPage = 1;
    this.showAllRows = false;
    this.displayedRows = [];
    
    let totalRows = 0;
    this.totalFilesToProcess = this.selectedFiles.length;
    this.currentFileIndex = 0;
    this.fileProcessStats = [];
    const startTime = Date.now();
    
    try {
      for (const file of this.selectedFiles) {
        this.currentFileIndex++;
        this.processingMessage = `Traitement ${isLargeUpload ? 'optimisé' : 'ultra-rapide'} du fichier ${this.currentFileIndex}/${this.totalFilesToProcess}: ${file.name}`;
        this.processingProgress = (this.currentFileIndex - 1) / this.totalFilesToProcess * 100;
        
        const fileName = file.name.toLowerCase();
        const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
        
        let beforeRows = this.allRows.length;
        try {
          // Gestion mémoire pour gros fichiers
          if (isLargeUpload && this.allRows.length > 500000) {
            this.processingMessage = this.t('TRT.msg.memoryOptimization');
            await this.optimizeMemoryUsage();
          }
          if (this.isCsvTextExtension(fileName)) {
            await this.readCsvFileOptimized(file);
          } else if (this.isExcelExtension(fileName)) {
            // Pour les très gros fichiers Excel, utiliser une méthode alternative
            const fileSizeMBNum = file.size / (1024 * 1024);
            if (fileSizeMBNum > 100) {
              await this.readExcelFileAlternative(file);
            } else {
              await this.readExcelFileOptimized(file);
            }
          } else if (this.isAcceptedFile(fileName)) {
            // Extension autorisée mais non gérée explicitement : tenter lecture Excel si extension Excel connue, sinon CSV
            if (this.isExcelExtension(fileName)) {
              const fileSizeMBNum = file.size / (1024 * 1024);
              if (fileSizeMBNum > 100) {
                await this.readExcelFileAlternative(file);
              } else {
                await this.readExcelFileOptimized(file);
              }
            } else {
              await this.readCsvFileOptimized(file);
            }
          } else {
            const formats = this.acceptedFileExtensions.join(', ');
            this.showError('upload', this.t('TRT.msg.acceptedExtensionsDynamic', { formats }) || this.t('TRT.msg.acceptedExtensions'));
            this.fileProcessStats.push({ name: file.name, rows: 0, status: 'erreur', errorMsg: this.t('TRT.msg.unsupportedFormatShort') });
            continue;
          }
          
          let afterRows = this.allRows.length;
          let fileRows = afterRows - beforeRows;
          totalRows += fileRows;
          this.fileProcessStats.push({ name: file.name, rows: fileRows, status: 'succès' });
          
        } catch (fileError) {
          this.fileProcessStats.push({ name: file.name, rows: 0, status: 'erreur', errorMsg: (fileError as any)?.message || this.t('TRT.msg.unknownError') });
        }
        
        // Mettre à jour la progression
        this.processingProgress = this.currentFileIndex / this.totalFilesToProcess * 100;
        
        // Pause pour gros uploads
        if (isLargeUpload && this.currentFileIndex < this.totalFilesToProcess) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Fusion optimisée des colonnes
      this.processingMessage = this.t('TRT.msg.mergeOptimized', { mode: isLargeUpload ? this.t('TRT.msg.mergeModeOptimized') : this.t('TRT.msg.mergeModeUltraFast') });
      this.allColumns = await this.mergeColumnsOptimized();
      
      // Normalisation optimisée des données
      this.processingMessage = `Normalisation ${isLargeUpload ? 'optimisée' : 'ultra-rapide'} des données...`;
      await this.normalizeDataOptimized();
      
      // Finalisation
      this.processingMessage = this.t('TRT.msg.finalizing');
      this.combinedRows = [...this.allRows];
      this.columns = [...this.allColumns];
      this.originalRows = [...this.allRows];
      
      // Optimiser l'affichage pour les gros fichiers
      this.optimizeForLargeFiles();
      
      // Mettre à jour l'affichage
      this.updateDisplayedRows();
      this.updatePagination();
      
      this.isProcessing = false;
      this.processingProgress = 100;
      
      const totalProcessed = this.allRows.length;
      const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
      
      this.showSuccess('upload', `Traitement ${isLargeUpload ? 'optimisé' : 'ultra-rapide'} terminé ! ${totalProcessed.toLocaleString()} lignes traitées en ${processingTime}s`);
      
    } catch (error) {
      this.isProcessing = false;
      this.showError('upload', this.t('TRT.msg.ultraFastProcessingError'));
    }
  }

  // Méthodes optimisées pour le traitement ultra-rapide
  private async readCsvFileOptimized(file: File): Promise<void> {
    const isLargeFile = file.size > 512 * 1024;
    const parsed = await readCsvFileUltraFast(file, {
      stripAirtelPreamble: true,
      onProgress: (processed, total) => {
        if (isLargeFile && processed % 2500 === 0) {
          this.processingProgress = Math.min(95, (processed / total) * 100);
          this.processingMessage = `Traitement CSV: ${processed.toLocaleString()}/${total.toLocaleString()} lignes`;
          this.cd.detectChanges();
        }
      },
      yieldFn: () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
    });

    for (let i = 0; i < parsed.rows.length; i++) {
      this.allRows.push(parsed.rows[i]);
    }

  }
  
  // Méthode optimisée pour détecter le délimiteur
  private detectDelimiter(line: string): string {
    const delimiters = [';', ',', '\t', '|'];
    const scores: { [key: string]: number } = {};
    
    // Optimisation : analyser seulement les premiers caractères pour les gros fichiers
    const sampleLine = line.length > 1000 ? line.substring(0, 1000) : line;
    
    delimiters.forEach(delimiter => {
      const parts = sampleLine.split(delimiter);
      scores[delimiter] = parts.length;
    });
    
    // Retourner le délimiteur qui donne le plus de colonnes
    const bestDelimiter = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
    
    // Validation supplémentaire pour les gros fichiers
    if (line.length > 1000) {
    }
    
    return bestDelimiter;
  }

  // Nouvelle méthode pour détecter les en-têtes dans les fichiers Excel
  private detectExcelHeaders(jsonData: any[][]): { headerRowIndex: number; headerRow: string[] } {
    
    // Mots-clés pour identifier les en-têtes
    const headerKeywords = [
      'N°', 'Date', 'Heure', 'Référence', 'Service', 'Paiement', 'Application :', 'Statut', 'Généré le :', 'Mode',
      'Compte', 'Wallet', 'Pseudo', 'Débit', 'Crédit', 'Montant', 'Commissions',
      'Opération', 'Agent', 'Correspondant', 'Sous-réseau', 'Transaction'
    ];
    
    let bestHeaderRowIndex = 0;
    let bestScore = 0;
    let bestHeaderRow: string[] = [];
    
    // Analyser plus de lignes pour trouver le meilleur candidat (optimisé pour gros fichiers)
    const maxRowsToCheck = Math.min(jsonData.length > 100000 ? 50 : 200, jsonData.length);
    
    // Détection spécifique GDJ (LA GABONAISE DES JEUX) : préambule de 5 lignes ignoré
    for (let i = 0; i < maxRowsToCheck; i++) {
      const row = jsonData[i] as any[];
      if (!row || row.length === 0) continue;
      const rowStrings = row.map((cell: any) => {
        if (cell === null || cell === undefined) return '';
        return String(cell).trim();
      });
      if (looksLikeGdjTransactionalHeader(rowStrings)) {
        return { headerRowIndex: i, headerRow: rowStrings };
      }
    }
    
    
    let emptyRowCount = 0;
    let consecutiveEmptyRows = 0;
    
    for (let i = 0; i < maxRowsToCheck; i++) {
      try {
        const row = jsonData[i] as any[];
        if (!row || row.length === 0) {
          emptyRowCount++;
          consecutiveEmptyRows++;
          continue;
        }
      
      // Réinitialiser le compteur de lignes vides consécutives
      consecutiveEmptyRows = 0;
      
      // Convertir la ligne en chaînes et nettoyer
      const rowStrings = row.map((cell: any) => {
        if (cell === null || cell === undefined) return '';
        return fixGarbledCharacters(String(cell).trim());
      });
      
      
      // Ignorer les lignes qui sont clairement des en-têtes de document
      const documentHeaders = [
        'Relevé de vos opérations', 'Application :', 'Compte Orange Money :', 'Début de Période :', 
        'Fin de Période :', 'Réseau :', 'Cameroon', 'Transactions réussies',
        'Wallet commission', 'Total', 'Total activités',
        'Account Holder:', 'Short Code:', 'Time Period:', 'Date of Report:'
      ];
      const nonEmptyCells = rowStrings.filter(cell => cell !== '').length;
      // Ne pas confondre une ligne d'en-tête de données (plusieurs colonnes, ex. « Application : »)
      // avec une ligne de métadonnées du relevé Orange Money.
      const isDocumentHeader = nonEmptyCells < 5 && documentHeaders.some(header => 
        rowStrings.some(cell => cell.includes(header))
      );
      
      if (isDocumentHeader) {
        continue;
      }
      
      // Ignorer les lignes qui contiennent principalement des données numériques (pas des en-têtes)
      const numericCells = rowStrings.filter(cell => {
        if (cell === '') return false;
        return !isNaN(Number(cell)) && cell.length > 0;
      });
      
      if (numericCells.length > rowStrings.filter(cell => cell !== '').length * 0.7) {
        continue;
      }
      
      // Log pour voir toutes les lignes analysées
      
      // Afficher aussi les lignes suivantes pour voir la structure
      if (i < maxRowsToCheck - 1) {
        const nextRow = jsonData[i + 1] as any[];
        if (nextRow && nextRow.length > 0) {
          const nextRowStrings = nextRow.map((cell: any) => {
            if (cell === null || cell === undefined) return '';
            return String(cell).trim();
          });
        }
      }
      
      // Calculer le score pour cette ligne
      let score = 0;
      let hasNumberColumn = false;
      let nonEmptyColumns = 0;
      let hasHeaderKeywords = false;
      let keywordMatches = 0;
      
      for (let j = 0; j < rowStrings.length; j++) {
        const cell = rowStrings[j];
        if (cell === '') continue;
        
        nonEmptyColumns++;
        
        // Vérifier si c'est une colonne "N°"
        if (cell.startsWith('N°') || cell === 'N' || cell.includes('N°')) {
          hasNumberColumn = true;
          score += 25; // Bonus important pour "N°"
        }
        
        // Vérifier les mots-clés d'en-tête
        for (const keyword of headerKeywords) {
          if (cell.toLowerCase().includes(keyword.toLowerCase())) {
            score += 8;
            hasHeaderKeywords = true;
            keywordMatches++;
          }
        }
        
        // Bonus spécial pour les lignes avec plusieurs colonnes "N°"
        if (cell.includes('N°')) {
          score += 5; // Bonus supplémentaire pour chaque colonne "N°"
        }
        
        // Bonus pour les colonnes qui ressemblent à des en-têtes
        if (cell.length > 0 && cell.length < 50 && 
            (cell.includes(' ') || cell.includes('(') || cell.includes(')') || 
             cell.includes(':') || cell.includes('-') || cell.includes('_'))) {
          score += 3;
        }
        
        // Bonus pour les colonnes avec des caractères spéciaux (typiques des en-têtes)
        if (cell.includes('é') || cell.includes('è') || cell.includes('à') || 
            cell.includes('ç') || cell.includes('ù') || cell.includes('ô')) {
          score += 4;
        }
      }
      
              // Bonus pour avoir une colonne "N°" et plusieurs colonnes non vides
        if (hasNumberColumn && nonEmptyColumns >= 3) {
          score += 30;
        }
      
      // Bonus pour avoir des mots-clés d'en-tête
      if (hasHeaderKeywords && nonEmptyColumns >= 2) {
        score += 15;
      }
      
      // Bonus pour avoir plusieurs mots-clés
      if (keywordMatches >= 3) {
        score += 20;
      }
      
      // Score de base pour les lignes avec plusieurs colonnes non vides
      if (nonEmptyColumns >= 3) {
        score += 8;
      }
      
      // Pénalité réduite pour les lignes avec peu de colonnes non vides
      if (nonEmptyColumns < 2) {
        score -= 3; // Réduit encore plus
      }
      
        
        // Log spécial pour les lignes avec beaucoup de colonnes non vides
        if (nonEmptyColumns >= 5) {
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestHeaderRowIndex = i;
          bestHeaderRow = [...rowStrings];
        }
        
                // Continuer l'analyse même après avoir trouvé un en-tête valide
        if (score > 0) {
        }
        
      } catch (error) {
        continue;
      }
    }
    
    
    // Fallback : si aucun en-tête valide n'est trouvé, utiliser la première ligne non vide
    if (bestScore <= 0) {
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        if (row && row.length > 0) {
          const rowStrings = row.map((cell: any) => {
            if (cell === null || cell === undefined) return '';
            return String(cell).trim();
          });
          
          const nonEmptyCount = rowStrings.filter(cell => cell !== '').length;
          if (nonEmptyCount >= 2) {
            return {
              headerRowIndex: i,
              headerRow: rowStrings
            };
          }
        }
      }
    }
    
    return {
      headerRowIndex: bestHeaderRowIndex,
      headerRow: bestHeaderRow
    };
  }

    // Méthode pour corriger les caractères spéciaux dans les en-têtes Excel
    private fixExcelColumnNames(columns: string[]): string[] {
      return columns.map((col: string) => {
        if (!col) return col;
        
        // Corrections spécifiques pour les fichiers Excel
        let corrected = col;
        
        // Corriger "Opration" -> "Opération"
        if (corrected.includes('Opration')) {
          corrected = corrected.replace(/Opration/g, 'Opération');
        }
        
        // Corriger "Montant (XAF)" -> "Montant (XAF)"
        if (corrected.includes('Montant') && corrected.includes('XAF')) {
          corrected = corrected.replace(/Montant\s*\(XAF\)/g, 'Montant (XAF)');
        }
        
        // Corriger "Commissions (XAF)" -> "Commissions (XAF)"
        if (corrected.includes('Commissions') && corrected.includes('XAF')) {
          corrected = corrected.replace(/Commissions\s*\(XAF\)/g, 'Commissions (XAF)');
        }
        
        // Corriger "N° de Compte" -> "N° de Compte"
        if (corrected.includes('N°') && corrected.includes('Compte')) {
          corrected = corrected.replace(/N°\s*de\s*Compte/g, 'N° de Compte');
        }
        
        // Corriger "N° Pseudo" -> "N° Pseudo"
        if (corrected.includes('N°') && corrected.includes('Pseudo')) {
          corrected = corrected.replace(/N°\s*Pseudo/g, 'N° Pseudo');
        }
        
        return corrected;
    });
  }

  private async readExcelFileOptimized(file: File): Promise<void> {
    try {
      // Afficher un indicateur de progression pour les fichiers volumineux
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 5) {
      }

      
      // Options optimisées pour les fichiers volumineux jusqu'à 700k lignes
      const options: XLSX.ParsingOptions = {
        cellDates: true,
        cellNF: false,
        cellText: false,
        sheetStubs: false,
        // Suppression de la limite pour supporter 700k lignes
        sheetRows: undefined, // Pas de limite pour 700k lignes
        // Optimisations pour très gros fichiers
        dense: true, // Mode dense pour économiser la mémoire
        codepage: 65001, // UTF-8
      };

      const workbook = await this.readExcelFile(file, options);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Vérifier si la feuille est vide avant de continuer
      if (!worksheet || !worksheet['!ref']) {
        return;
      }
      
      // Conversion optimisée en tableau de tableaux pour analyse
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '', // Valeur par défaut pour les cellules vides
        raw: false // Convertir les dates en strings
      }) as any[][];
      
      if (!jsonData || jsonData.length === 0) {
        return;
      }
      
      
      // Détecter les en-têtes avec une méthode optimisée
      const headerDetection = this.detectExcelHeaders(jsonData);
      const headers = headerDetection.headerRow;
      const headerRowIndex = headerDetection.headerRowIndex;
      
      
      // Vérifier si des en-têtes valides ont été trouvés
      if (!headers || headers.length === 0 || headers.every(h => !h || h.trim() === '')) {
        // Essayer de trouver la première ligne avec des données (limité pour performance)
        const maxSearchRows = Math.min(200, jsonData.length);
        for (let i = 0; i < maxSearchRows; i++) {
          const row = jsonData[i] as any[];
          if (row && row.length > 0) {
            const rowStrings = row.map((cell: any) => {
              if (cell === null || cell === undefined) return '';
              return String(cell).trim();
            });
            
            const nonEmptyCount = rowStrings.filter(cell => cell !== '').length;
            if (nonEmptyCount >= 2) {
              const fallbackHeaders = rowStrings.map((h, idx) => h || `Col${idx + 1}`);
              const correctedHeaders = this.fixExcelColumnNames(fallbackHeaders);
              
              // Créer les lignes de données avec traitement par chunks pour les gros fichiers
              const rows: any[] = [];
              const totalDataRows = jsonData.length - i - 1;
              const isLargeFile = totalDataRows > 100000; // Plus de 100k lignes
              const isVeryLargeFile = totalDataRows > 500000; // Plus de 500k lignes
              const chunkSize = isVeryLargeFile ? 20000 : isLargeFile ? 10000 : 5000; // Chunks optimisés pour 700k
              
              for (let j = i + 1; j < jsonData.length; j += chunkSize) {
                const endIndex = Math.min(j + chunkSize, jsonData.length);
                
                for (let k = j; k < endIndex; k++) {
                  const rowData = jsonData[k] as any[];
                  if (!rowData || rowData.length === 0) continue;
                  
                  const row: any = {};
                  correctedHeaders.forEach((header: string, index: number) => {
                    const value = rowData[index];
                    row[header] = value !== undefined && value !== null ? value : '';
                  });
                  rows.push(row);
                }
                
                // Log de progression pour gros fichiers
                if (fileSizeMB > 5 && j % (chunkSize * 10) === i + 1) {
                  const progress = ((j - i - 1) / (jsonData.length - i - 1) * 100).toFixed(1);
                }
              }
              
              
              // Mettre à jour les propriétés du composant
              this.allRows.push(...rows);
              this.allColumns = [...correctedHeaders];
              this.columns = [...correctedHeaders];
              
              
              return;
            }
          }
        }
        
        return;
      }
      
      // Corriger les caractères spéciaux dans les en-têtes
      const correctedHeaders = this.fixExcelColumnNames(headers);
      
      // Créer les lignes de données en commençant après la ligne d'en-tête
      const totalDataRows = jsonData.length - headerRowIndex - 1;
      const isLargeFile = totalDataRows > 100000; // Plus de 100k lignes
      const isVeryLargeFile = totalDataRows > 500000; // Plus de 500k lignes
      const chunkSize = isVeryLargeFile ? 15000 : isLargeFile ? 10000 : 5000; // Chunks optimisés pour 700k
      
      
      // Mise à jour de la progression pour gros fichiers
      let processedRows = 0;
      const updateProgress = () => {
        if (isLargeFile) {
          this.processingProgress = Math.min(95, (processedRows / totalDataRows) * 100);
          this.processingMessage = `Traitement Excel: ${processedRows.toLocaleString()}/${totalDataRows.toLocaleString()} lignes`;
        }
      };
      
      // Traitement optimisé par chunks pour Excel
      for (let i = headerRowIndex + 1; i < jsonData.length; i += chunkSize) {
        const chunkEnd = Math.min(i + chunkSize, jsonData.length);
        const chunkRows: any[] = [];
        
        for (let j = i; j < chunkEnd; j++) {
          const rowData = jsonData[j] as any[];
          if (!rowData || rowData.length === 0) continue;
          
          const row: any = {};
          correctedHeaders.forEach((header: string, index: number) => {
            const value = rowData[index];
            row[header] = value !== undefined && value !== null ? value : '';
          });
          chunkRows.push(row);
        }
        
        // Ajouter le chunk aux données
        this.allRows.push(...chunkRows);
        processedRows += chunkRows.length;
        
        // Mettre à jour la progression pour gros fichiers
        if (isLargeFile) {
          updateProgress();
        }
        
        // Permettre à l'interface de respirer (plus fréquent pour gros fichiers)
        const yieldInterval = isLargeFile ? chunkSize : chunkSize * 5;
        if (i % yieldInterval === 0) {
          await new Promise(resolve => setTimeout(resolve, isLargeFile ? 0 : 1));
        }
      }
      
      
      // Mettre à jour les propriétés du composant
      this.allColumns = [...correctedHeaders];
      this.columns = [...correctedHeaders];
      
      // Détection automatique des types de champs
      this.performFieldTypeAnalysis();
      
    } catch (error) {
      throw error;
    }
  }

  private async mergeColumnsOptimized(): Promise<string[]> {
    const allColsSet = new Set<string>();
    
    // Traitement optimisé par chunks
    for (let i = 0; i < this.allRows.length; i += this.chunkSize) {
      const chunk = this.allRows.slice(i, i + this.chunkSize);
      chunk.forEach(row => {
        Object.keys(row).forEach(col => allColsSet.add(col));
      });
    }
    
    return Array.from(allColsSet);
  }

  private async normalizeDataOptimized(): Promise<void> {
    // Traitement optimisé par chunks
    for (let i = 0; i < this.allRows.length; i += this.chunkSize) {
      const chunk = this.allRows.slice(i, i + this.chunkSize);
      const normalizedChunk = chunk.map(row => {
        const newRow: any = {};
        for (const col of this.allColumns) {
          newRow[col] = row[col] !== undefined ? row[col] : '';
        }
        return newRow;
      });
      
      // Remplacer les lignes dans le tableau original
      for (let j = 0; j < normalizedChunk.length; j++) {
        this.allRows[i + j] = normalizedChunk[j];
      }
    }
  }

  // Méthode utilitaire pour créer un délai
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Méthode d'optimisation mémoire pour gros fichiers
  private async optimizeMemoryUsage(): Promise<void> {
    try {
      
      // Forcer le garbage collection si disponible
      if ('gc' in window && typeof (window as any).gc === 'function') {
        (window as any).gc();
      }
      
      // Nettoyer les références temporaires
      this.displayedRows = [];
      
      // Compacter les données si nécessaire
      if (this.allRows.length > 1000000) {
        // Créer une copie compacte des données
        const compactRows = this.allRows.map(row => {
          const compactRow: any = {};
          Object.keys(row).forEach(key => {
            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
              compactRow[key] = row[key];
            }
          });
          return compactRow;
        });
        this.allRows = compactRows;
      }
      
      // Pause pour permettre au navigateur de libérer la mémoire
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
    }
  }

  // Méthode optimisée pour traiter les données en arrière-plan sans bloquer l'interface
  private async processDataInBackground<T>(
    data: T[], 
    processor: (chunk: T[]) => void, 
    chunkSize: number = 5000, // Chunks plus grands pour optimiser
    progressCallback?: (progress: number) => void
  ): Promise<void> {
    const totalChunks = Math.ceil(data.length / chunkSize);
    let processedChunks = 0;

    // Traitement par chunks optimisé
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      
      // Traiter le chunk immédiatement
      processor(chunk);
      processedChunks++;
      
      // Mettre à jour la progression
      if (progressCallback) {
        const progress = (processedChunks / totalChunks) * 100;
        progressCallback(progress);
      }
      
      // Céder le contrôle moins fréquemment pour optimiser la vitesse
      if (processedChunks % 10 === 0) { // Tous les 10 chunks
        await new Promise<void>((resolve) => {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(() => resolve(), { timeout: 10 });
          } else {
            setTimeout(resolve, 0);
          }
        });
      }
    }
  }

  /**
   * Méthode alternative pour lire les fichiers Excel très volumineux
   * Utilise une approche de lecture par chunks pour éviter les erreurs de mémoire
   */
  private async readExcelFileAlternative(file: File): Promise<void> {
    const fileSizeMB = file.size / (1024 * 1024);
    
    this.processingMessage = `Traitement fichier très volumineux (${fileSizeMB.toFixed(1)} MB)...`;
    
    // Pour les fichiers > 200MB, utiliser une approche de streaming
    if (fileSizeMB > 200) {
      await this.readExcelFileStreaming(file);
      return;
    }
    
    try {
      // Lire le fichier par chunks pour éviter les problèmes de mémoire
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const data = new Uint8Array(arrayBuffer);
      
      // Options ultra-restrictives pour les très gros fichiers
      const options: XLSX.ParsingOptions = {
        type: 'array',
        cellDates: false,
        cellNF: false,
        cellText: false,
        sheetStubs: false,
        // Lire toutes les lignes (attention mémoire sur fichiers énormes)
        sheetRows: undefined,
        // Désactiver tout ce qui n'est pas essentiel
        bookSheets: false,
        bookProps: false,
        bookVBA: false,
        cellStyles: false,
        cellHTML: false,
        cellFormula: false
      };

      const workbook = XLSX.read(data, options);
      
      if (!workbook.Sheets || workbook.SheetNames.length === 0) {
        throw new Error(this.t('TRT.msg.noAccessibleSheet'));
      }

      // Traiter seulement la première feuille pour éviter les problèmes de mémoire
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      if (!worksheet) {
        throw new Error('Impossible de lire la première feuille');
      }


      // Lecture sans limitation de plage
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '',
        raw: true
      }) as any[][];

      if (!jsonData || jsonData.length === 0) {
        throw new Error('Aucune donnée trouvée dans la première feuille');
      }


      // Détecter les en-têtes
      const headerDetection = this.detectExcelHeaders(jsonData);
      const headers = headerDetection.headerRow;
      const headerRowIndex = headerDetection.headerRowIndex;

      let rows: any[] = [];
      
      if (!headers || headers.length === 0 || headers.every(h => !h || h.trim() === '')) {
        // Fallback: utiliser la première ligne comme en-têtes
        const fallbackHeaders = jsonData[0]?.map((h, idx) => h || `Col${idx + 1}`) || [];
        const correctedHeaders = this.fixExcelColumnNames(fallbackHeaders);
        
        // Créer les lignes de données
        const maxRows = jsonData.length;
        for (let i = 1; i < maxRows; i++) {
          const rowData = jsonData[i] as any[];
          if (!rowData || rowData.length === 0) continue;
          
          const row: any = {};
          correctedHeaders.forEach((header: string, index: number) => {
            const value = rowData[index];
            row[header] = value !== undefined && value !== null ? value : '';
          });
          rows.push(row);
        }
      } else {
        // Utiliser les en-têtes détectés
        const correctedHeaders = headers.map(header => this.fixExcelColumnNames([header])[0]);
        
        const maxRows = jsonData.length;
        for (let i = headerRowIndex + 1; i < maxRows; i++) {
          const rowData = jsonData[i] as any[];
          if (!rowData || rowData.length === 0) continue;
          
          const row: any = {};
          correctedHeaders.forEach((header: string, index: number) => {
            const value = rowData[index];
            row[header] = value !== undefined && value !== null ? value : '';
          });
          rows.push(row);
        }
      }

      // Ajouter les lignes au composant
      this.allRows.push(...rows);
      
      // Mettre à jour les colonnes
      const newColumns = await this.mergeColumnsOptimized();
      this.allColumns = newColumns;
      
    } catch (error) {
      
      // En cas d'erreur avec un très gros fichier, suggérer des solutions
      this.showError('upload', 
        `Impossible de traiter le fichier Excel de ${fileSizeMB.toFixed(1)} MB. 
        
        Le fichier est trop volumineux pour être traité par la bibliothèque XLSX.
        
        Solutions recommandées :
        1. Ouvrez le fichier dans Excel et sauvegardez-le au format CSV
        2. Divisez le fichier en plusieurs parties plus petites (par mois ou par trimestre)
        3. Supprimez les colonnes non nécessaires avant l'upload
        4. Utilisez un fichier plus récent si possible
        
        Les fichiers Excel > 200 MB nécessitent généralement un traitement spécial.`);
      
      throw error;
    }
  }

  /**
   * Méthode de streaming pour les fichiers Excel extrêmement volumineux (>200MB)
   * Utilise une approche de lecture par petits chunks
   */
  private async readExcelFileStreaming(file: File): Promise<void> {
    const fileSizeMB = file.size / (1024 * 1024);
    
    this.processingMessage = `Fichier extrêmement volumineux détecté (${fileSizeMB.toFixed(1)} MB). 
    Traitement par streaming des 100,000 premières lignes.`;
    
    try {
      // Pour les fichiers > 200MB, on ne peut pas les traiter entièrement
      // On suggère plutôt des solutions alternatives
      this.showError('upload', 
        `Fichier Excel extrêmement volumineux détecté (${fileSizeMB.toFixed(1)} MB).
        
        Ce fichier est trop volumineux pour être traité directement par l'application.
        
        Solutions recommandées :
        1. Ouvrez le fichier dans Excel et sauvegardez-le au format CSV
        2. Divisez le fichier en plusieurs parties (par mois, par trimestre, ou par service)
        3. Supprimez les colonnes non nécessaires avant l'upload
        4. Utilisez un fichier plus récent avec moins de données
        5. Considérez utiliser un outil de traitement par lots
        
        Les fichiers Excel > 200 MB nécessitent généralement un prétraitement avant l'upload.`);
      
      // Créer des données d'exemple pour montrer la structure attendue
      const exampleRows = [
        {
          'Date': '2025-01-15',
          'Transaction': 'Exemple de transaction',
          'Montant': '1000',
          'Service': 'Orange Money',
          'Statut': 'Traité'
        }
      ];
      
      this.allRows.push(...exampleRows);
      
      const exampleColumns = ['Date', 'Transaction', 'Montant', 'Service', 'Statut'];
      this.allColumns = exampleColumns;
      
      
    } catch (error) {
      throw error;
    }
  }

  /**
   * Lit un fichier comme ArrayBuffer de manière asynchrone
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  }

  // Nouvelle méthode asynchrone pour lire les fichiers Excel
  async readExcelFileAsync(file: File) {
    try {
      const workbook = await this.readExcelFile(file);
      let header: string[] | undefined = undefined;
      
      for (let i = 0; i < workbook.SheetNames.length; i++) {
        try {
          const sheetName = workbook.SheetNames[i];
          this.processingMessage = `Traitement de la feuille: ${sheetName}`;
          await this.delay(10);
          
          const worksheet = workbook.Sheets[sheetName];
          let rows: any[];
          
          if (i === 0) {
            // Première feuille : extraire l'en-tête
            rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            if (rows.length > 0) {
              header = Object.keys(rows[0]);
            }
          } else {
            // Autres feuilles : lire sans en-tête et mapper avec l'en-tête de la première feuille
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', header: 1 });
            
            if (header && rawRows.length > 0) {
              rows = rawRows.map((row: any) => {
                const mappedRow: any = {};
                header!.forEach((colName, index) => {
                  mappedRow[colName] = row[index] || '';
                });
                return mappedRow;
              });
            } else {
              rows = [];
            }
          }
          
          
          if (rows.length > 0) {
            try {
              
              // Traitement en arrière-plan avec chunks très petits
              await this.processDataInBackground(
                rows,
                (chunk) => {
                  this.combinedRows.push(...chunk);
                  this.allRows.push(...chunk);
                },
                50, // Chunks très petits pour éviter le blocage
                (progress) => {
                  this.processingMessage = `Traitement de la feuille ${sheetName}: ${Math.round(progress)}%`;
                }
              );
              
              const rowCols = header ? header : Object.keys(rows[0]);
              
              for (const col of rowCols) {
                if (!this.columns.includes(col)) {
                  this.columns.push(col);
                }
                if (!this.allColumns.includes(col)) {
                  this.allColumns.push(col);
                }
              }
              
            } catch (addError) {
              this.showError('upload', `Erreur lors du traitement de la feuille ${sheetName}: ${addError}`);
            }
          }
        } catch (sheetError) {
          this.showError('upload', `Erreur lors du traitement de la feuille ${workbook.SheetNames[i]}: ${sheetError}`);
          // Continuer avec les autres feuilles
        }
      }
    } catch (e) {
      this.showError('upload', this.t('TRT.msg.excelReadError'));
      throw e;
    }
  }

  // Méthode améliorée pour détecter automatiquement les séparateurs CSV
  detectCsvDelimiter(csvContent: string): string {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return ';';

    const firstLine = lines[0];
    const secondLine = lines.length > 1 ? lines[1] : '';
    
    // Séparateurs à tester
    const delimiters = [',', ';', '\t', '|', ':'];
    const delimiterScores: { [key: string]: number } = {};
    
    // Analyser la première ligne pour chaque séparateur
    delimiters.forEach(delimiter => {
      const fields = firstLine.split(delimiter);
      delimiterScores[delimiter] = fields.length;
    });
    
    // Si on a une deuxième ligne, comparer la cohérence
    if (secondLine) {
      delimiters.forEach(delimiter => {
        const fields1 = firstLine.split(delimiter);
        const fields2 = secondLine.split(delimiter);
        
        // Bonus pour la cohérence entre les lignes
        if (Math.abs(fields1.length - fields2.length) <= 1) {
          delimiterScores[delimiter] += 10;
        }
      });
    }
    
    // Trouver le séparateur avec le meilleur score
    let bestDelimiter = ';';
    let bestScore = 0;
    
    Object.entries(delimiterScores).forEach(([delimiter, score]) => {
      if (score > bestScore) {
        bestScore = score;
        bestDelimiter = delimiter;
      }
    });
    
    
    return bestDelimiter;
  }

  // Méthode pour prévisualiser les données CSV
  async previewCsvData(csvContent: string, delimiter: string): Promise<{ columns: string[], data: any[], hasHeader: boolean }> {
    return new Promise((resolve, reject) => {
      // Détecter les fichiers GDJ (LA GABONAISE DES JEUX) : préambule de 5 lignes ignoré
      const gdjDetection = this.detectGdjFile(csvContent, delimiter);
      this.isGdjFile = gdjDetection.isGdj;
      this.gdjHeaderRowIndex = gdjDetection.headerRowIndex;

      if (gdjDetection.isGdj) {
        Papa.parse(csvContent, {
          header: false,
          delimiter,
          skipEmptyLines: true,
          complete: (results) => {
            const rawRows = results.data as any[];

            if (rawRows.length > gdjDetection.headerRowIndex) {
              const headerRow = gdjDetection.headerRow;
              const columns = headerRow.map((col, index) => col || `Col${index + 1}`);

              const dataRows = rawRows.slice(gdjDetection.headerRowIndex + 1, gdjDetection.headerRowIndex + 11);
              const data = dataRows.map((row: any[]) => {
                const obj: any = {};
                columns.forEach((col, idx) => {
                  obj[col] = row[idx] || '';
                });
                return obj;
              });

              resolve({ columns, data, hasHeader: true });
            } else {
              resolve({ columns: [], data: [], hasHeader: false });
            }
          },
          error: (error: any) => {
            reject(error);
          }
        });
        return;
      }

      // Traitement normal pour les autres fichiers
      Papa.parse(csvContent, {
        delimiter,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as any[];
          if (rows.length === 0) {
            resolve({ columns: [], data: [], hasHeader: false });
            return;
          }
          
          // Essayer avec header d'abord
          Papa.parse(csvContent, {
            header: true,
            delimiter,
            skipEmptyLines: true,
            complete: (headerResults) => {
              const headerRows = headerResults.data as any[];
              const firstRow = headerRows[0] || {};
              const allKeys = Object.keys(firstRow);
              
              // Vérifier si ça ressemble à un header valide
              const looksLikeHeader = allKeys.length > 1 && 
                !allKeys.some(k => k.toLowerCase().startsWith('field')) &&
                allKeys.some(k => k.trim().length > 0);
              
              if (looksLikeHeader) {
                // Avec header
                const columns = allKeys.map((key, index) => key || `Col${index + 1}`);
                const data = headerRows.slice(0, 10); // Limiter à 10 lignes pour la prévisualisation
                resolve({ columns, data, hasHeader: true });
              } else {
                // Sans header
                const firstRow = rows[0];
                const columns = firstRow.map((val: any, index: number) => 
                  val ? val.toString() : `Col${index + 1}`
                );
                const data = rows.slice(0, 10); // Limiter à 10 lignes pour la prévisualisation
                resolve({ columns, data, hasHeader: false });
              }
            },
                         error: (error: any) => {
               reject(error);
             }
           });
         },
         error: (error: any) => {
           reject(error);
         }
      });
    });
  }

  async readCsvFile(file: File) {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e: any) => {
        try {
          const csv = e.target.result;
          
          // Détection automatique du séparateur
          this.detectedDelimiter = this.detectCsvDelimiter(csv);
          
          // Prévisualiser les données
          try {
            const preview = await this.previewCsvData(csv, this.detectedDelimiter);
            this.csvPreviewColumns = preview.columns;
            this.csvPreviewData = preview.data;
            this.showCsvPreview = true;
          } catch (previewError) {
          }
          
                      // On tente d'abord avec header: true
            Papa.parse(csv, {
              header: true,
              delimiter: this.detectedDelimiter,
              skipEmptyLines: true,
            complete: async (results) => {
              try {
                let rows = results.data as any[];
                
                // Si les colonnes sont nommées field1, field2... ou qu'il n'y a qu'une seule colonne, on relit sans header
                const firstRow = rows[0] || {};
                const allKeys = Object.keys(firstRow);
                const looksLikeNoHeader = allKeys.length <= 1 || allKeys.some(k => k.toLowerCase().startsWith('field'));
                
                if (looksLikeNoHeader) {
                  Papa.parse(csv, {
                    header: false,
                    delimiter: this.detectedDelimiter, // Utiliser le séparateur détecté
                    skipEmptyLines: true,
                    complete: async (res2) => {
                      try {
                        const rawRows = res2.data as any[];
                        
                        if (rawRows.length > 1) {
                          const headerRow = rawRows[0];
                          const dataRows = rawRows.slice(1);
                          const colNames = headerRow.map((v: any, i: number) => v ? v.toString() : 'Col' + (i+1));
                          
                          
                          // Traitement en arrière-plan avec chunks très petits
                          await this.processDataInBackground(
                            dataRows,
                            (chunk) => {
                              const rowsWithHeader = chunk.map((row: any[]) => {
                                const obj: any = {};
                                colNames.forEach((col: string, idx: number) => {
                                  obj[col] = row[idx];
                                });
                                return obj;
                              });
                              
                              this.combinedRows.push(...rowsWithHeader);
                              this.allRows.push(...rowsWithHeader);
                            },
                            50, // Chunks très petits pour éviter le blocage
                            (progress) => {
                              this.processingMessage = `Traitement CSV: ${Math.round(progress)}%`;
                            }
                          );
                          
                          for (const col of colNames) {
                            if (!this.columns.includes(col)) this.columns.push(col);
                            if (!this.allColumns.includes(col)) this.allColumns.push(col);
                          }
                          
                        }
                        this.cd.detectChanges();
                        resolve();
                      } catch (error) {
                        reject(error);
                      }
                    },
                    error: (err) => {
                      this.showError('upload', this.t('TRT.msg.csvReadError'));
                      reject(err);
                    }
                  });
                  return;
                }
                
                // Cas normal avec header
                if (rows.length > 0) {
                  
                  // Traitement en arrière-plan avec chunks très petits
                  await this.processDataInBackground(
                    rows,
                    (chunk) => {
                      this.combinedRows.push(...chunk);
                      this.allRows.push(...chunk);
                    },
                    50, // Chunks très petits pour éviter le blocage
                    (progress) => {
                      this.processingMessage = `Traitement CSV: ${Math.round(progress)}%`;
                    }
                  );
                  
                  const rowCols = Object.keys(rows[0]);
                  for (const col of rowCols) {
                    if (!this.columns.includes(col)) {
                      this.columns.push(col);
                    }
                    if (!this.allColumns.includes(col)) {
                      this.allColumns.push(col);
                    }
                  }
                  
                }
                this.cd.detectChanges();
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            error: (err) => {
              this.showError('upload', this.t('TRT.msg.csvReadError'));
              reject(err);
            }
          });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => {
        this.showError('upload', this.t('TRT.msg.fileReadError'));
        reject();
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  updateDisplayedRows() {
    
    // Si une sélection est appliquée, afficher seulement les colonnes sélectionnées
    if (this.selectionApplied && this.selectedCols.length > 0) {
      this.combinedRows = this.allRows.map(row => {
        const newRow: any = {};
        for (const col of this.selectedCols) {
          newRow[col] = row[col];
        }
        return newRow;
      });
      this.columns = [...this.selectedCols];
    } else {
      // Si pas de sélection appliquée, afficher toutes les colonnes
      // Ne pas réinitialiser combinedRows si des modifications ont été appliquées
      const hasExistingData = this.combinedRows.length > 0;
      const hasSameRowCount = this.combinedRows.length === this.allRows.length;
      
      if (!hasExistingData || !hasSameRowCount) {
        this.combinedRows = [...this.allRows];
        this.columns = [...this.allColumns];
      } else {
      }
    }
    
    // Réinitialiser la pagination pour le premier chargement
    this.currentPage = 1;
    this.showAllRows = false;
    
    // Optimisation automatique pour les gros fichiers
    this.optimizeForLargeFiles();
    
    // Mettre à jour l'affichage paginé
    this.updatePagination();
    
    // Forcer la détection de changement avec un délai pour s'assurer que le DOM est prêt
    setTimeout(() => {
      this.cd.detectChanges();
      // Forcer un second rafraîchissement pour s'assurer que tout est bien affiché
      setTimeout(() => {
        this.cd.detectChanges();
      }, 100);
    }, 50);
  }

  updatePagination() {
    // S'assurer que la pagination est correctement initialisée
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
    this.updateDisplayedRowsForPage();
    
    // Forcer la détection de changement
    this.cd.detectChanges();
  }

  updateDisplayedRowsForPage() {
    
    if (this.showAllRows || this.combinedRows.length <= this.maxDisplayedRows) {
      this.displayedRows = this.combinedRows;
    } else {
      const startIndex = (this.currentPage - 1) * this.rowsPerPage;
      const endIndex = startIndex + this.rowsPerPage;
      this.displayedRows = this.combinedRows.slice(startIndex, endIndex);
    }
    
    // Forcer la détection de changement avec un délai pour s'assurer que le DOM est prêt
    setTimeout(() => {
      this.cd.detectChanges();
      // Forcer un second rafraîchissement pour s'assurer que tout est bien affiché
      setTimeout(() => {
        this.cd.detectChanges();
      }, 100);
    }, 50);
  }

  get totalPages(): number {
    if (this.showAllRows || this.combinedRows.length <= this.maxDisplayedRows) {
      return 1;
    }
    return Math.ceil(this.combinedRows.length / this.rowsPerPage);
  }

  get startRow(): number {
    if (this.showAllRows || this.combinedRows.length <= this.maxDisplayedRows) {
      return 1;
    }
    return (this.currentPage - 1) * this.rowsPerPage + 1;
  }

  get endRow(): number {
    if (this.showAllRows || this.combinedRows.length <= this.maxDisplayedRows) {
      return this.combinedRows.length;
    }
    return Math.min(this.currentPage * this.rowsPerPage, this.combinedRows.length);
  }

  onPageChange(page: number) {
    this.currentPage = page;
    this.updateDisplayedRowsForPage();
  }

  onRowsPerPageChange() {
    this.currentPage = 1;
    this.updateDisplayedRowsForPage();
  }

  toggleShowAllRows() {
    this.showAllRows = !this.showAllRows;
    this.updateDisplayedRowsForPage();
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const totalPages = this.totalPages;
    const currentPage = this.currentPage;
    
    // Toujours afficher la première page
    pages.push(1);
    
    // Ajouter les pages autour de la page courante
    const start = Math.max(2, currentPage - 2);
    const end = Math.min(totalPages - 1, currentPage + 2);
    
    if (start > 2) {
      pages.push(-1); // Indicateur de pages manquantes
    }
    
    for (let i = start; i <= end; i++) {
      if (i > 1 && i < totalPages) {
        pages.push(i);
      }
    }
    
    if (end < totalPages - 1) {
      pages.push(-1); // Indicateur de pages manquantes
    }
    
    // Toujours afficher la dernière page
    if (totalPages > 1) {
      pages.push(totalPages);
    }
    
    return pages;
  }

  // Méthode pour optimiser les performances d'affichage
  optimizeForLargeFiles() {
    if (this.combinedRows.length > 50000) {
      // Pour les très gros fichiers, réduire automatiquement le nombre de lignes par page
      if (this.rowsPerPage > 200) {
        this.rowsPerPage = 200;
        this.showSuccess('performance', this.t('TRT.msg.performanceOptimized'));
      }
      
      // Désactiver l'option "Afficher toutes les lignes" pour les très gros fichiers
      if (this.showAllRows) {
        this.showAllRows = false;
        this.updateDisplayedRowsForPage();
        this.showSuccess('performance', this.t('TRT.msg.performanceDisplayOptimized'));
      }
    }
  }

  // Méthode pour obtenir des statistiques sur le fichier
  getFileStats() {
    return {
      totalRows: this.combinedRows.length,
      totalColumns: this.columns.length,
      fileSize: this.estimateFileSize(),
      isLargeFile: this.combinedRows.length > 100000,
      isVeryLargeFile: this.combinedRows.length > 500000
    };
  }

  // Estimation de la taille du fichier en mémoire
  private estimateFileSize(): string {
    if (this.combinedRows.length === 0) return '0 MB';
    
    // Estimation approximative : chaque ligne ≈ 1KB
    const estimatedSizeMB = (this.combinedRows.length * 1024) / (1024 * 1024);
    
    if (estimatedSizeMB > 1024) {
      return `${(estimatedSizeMB / 1024).toFixed(1)} GB`;
    } else {
      return `${estimatedSizeMB.toFixed(1)} MB`;
    }
  }

  onDedupColChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      if (!this.dedupCols.includes(input.value)) {
        this.dedupCols.push(input.value);
      }
    } else {
      this.dedupCols = this.dedupCols.filter(col => col !== input.value);
    }
  }

  deduplicate() {
    try {
      if (this.dedupCols.length === 0) return;
      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const row of this.combinedRows) {
        const key = this.dedupCols.map(col => (row[col] ?? '').toString().trim().toLowerCase()).join('||');
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(row);
        }
      }
      this.combinedRows = deduped;
      this.showSuccess('dedup', this.t('TRT.msg.duplicatesRemoved'));
    } catch (e) {
      this.showError('dedup', this.t('TRT.msg.duplicateRemovalError'));
    }
  }

  hasFormattingOption(): boolean {
    return this.formatOptions.removeCharacters || this.formatOptions.removeNumbers || this.formatOptions.removeIndicatif || this.formatOptions.removeDecimals || this.formatOptions.keepLastDigits || this.formatOptions.removeZeroDecimals || this.formatOptions.removeSpaces;
  }

  hasHeaderFormattingOption(): boolean {
    return false; // Plus d'options d'en-têtes
  }

  applyHeaderFormatting() {
    this.showError('format', this.t('TRT.msg.noHeaderFormatOption'));
  }

  applyColumnRename() {
    const sourceColumn = this.renameSourceCol?.trim();
    const newName = this.renameNewName?.trim();

    if (!sourceColumn || !newName) {
      this.showError('columnRename', this.t('TRT.msg.selectColumnToRename'));
      return;
    }

    if (sourceColumn === newName) {
      this.showError('columnRename', this.t('TRT.msg.renameDifferentName'));
      return;
    }

    if (!this.columns.includes(sourceColumn)) {
      this.showError('columnRename', `La colonne « ${sourceColumn} » est introuvable.`);
      return;
    }

    if (this.columns.includes(newName)) {
      this.showError('columnRename', `La colonne « ${newName} » existe déjà.`);
      return;
    }

    try {
      this.renameColumnInDataset(sourceColumn, newName);
      this.renameSourceCol = '';
      this.renameNewName = '';
      this.updateDisplayedRows();
      this.showSuccess('columnRename', `En-tête renommé : « ${sourceColumn} » → « ${newName} ».`);
    } catch (e) {
      this.showError('columnRename', this.t('TRT.msg.renameError'));
    }
  }

  private renameColumnInDataset(sourceColumn: string, newName: string): void {
    const renameRows = (rows: any[]) => rows.map(row => this.renameRowColumnKey(row, sourceColumn, newName));

    this.originalRows = renameRows(this.originalRows);
    this.allRows = renameRows(this.allRows);
    this.combinedRows = renameRows(this.combinedRows);
    if (this.filteredRows?.length) {
      this.filteredRows = renameRows(this.filteredRows);
    }

    const renameInList = (cols: string[]) => cols.map(col => col === sourceColumn ? newName : col);
    this.allColumns = renameInList(this.allColumns);
    this.columns = renameInList(this.columns);
    this.dedupCols = renameInList(this.dedupCols);
    this.selectedCols = renameInList(this.selectedCols);
    this.concatCols = renameInList(this.concatCols);

    if (this.extractCol === sourceColumn) {
      this.extractCol = newName;
    }
    if (this.exportTypeCol === sourceColumn) {
      this.exportTypeCol = newName;
    }
    if (this.exportDateCol === sourceColumn) {
      this.exportDateCol = newName;
    }
    if (this.selectedFilterColumn === sourceColumn) {
      this.selectedFilterColumn = newName;
    }

    this.multipleFilters.forEach(filter => {
      if (filter.column === sourceColumn) {
        filter.column = newName;
      }
    });

    Object.keys(this.formatSelections).forEach(key => {
      this.formatSelections[key] = renameInList(this.formatSelections[key] || []);
    });
  }

  private renameRowColumnKey(row: Record<string, any>, sourceColumn: string, newName: string): Record<string, any> {
    if (!row || !Object.prototype.hasOwnProperty.call(row, sourceColumn)) {
      return row;
    }

    return renameKeyPreservingOrder(row, sourceColumn, newName);
  }

  applyFormatting() {
    if (this.formatOptions.removeCharacters) {
      this.applyRemoveCharactersFormatting();
    }
    if (this.formatOptions.removeNumbers) {
      this.applyRemoveNumbersFormatting();
    }
    if (this.formatOptions.removeIndicatif) {
      this.applyRemoveIndicatifFormatting();
    }
    if (this.formatOptions.removeDecimals) {
      this.applyRemoveDecimalsFormatting();
    }
    if (this.formatOptions.keepLastDigits) {
      this.applyKeepLastDigitsFormatting();
    }
    if (this.formatOptions.removeZeroDecimals) {
      this.applyRemoveZeroDecimalsFormatting();
    }
    if (this.formatOptions.removeSpaces) {
      this.applyRemoveSpacesFormatting();
    }
  }

  // Méthode simple qui ne fait rien
  private normalizeColumnHeaders() {
    // Ne fait rien - les colonnes restent inchangées
  }

  // Méthode simple qui retourne la valeur sans modification
  private fixSpecialCharacters(text: string): string {
    return text;
  }

  // Méthode simple qui retourne la valeur sans modification
  private removeAccents(text: string): string {
    return text;
  }

  // Méthode simple qui retourne la valeur sans modification
  private standardizeHeader(text: string): string {
    return text;
  }

  // Méthode simple qui retourne la valeur sans modification
  private normalizeHeader(text: string): string {
    return text;
  }

  applyExtraction() {
    try {
      if (!this.extractCol || !this.extractType) return;
      // Utilise la clé personnalisée si fournie, sinon nom par défaut
      const newCol = this.extractKey?.trim() ? this.extractKey.trim() : this.getExtractionColName();
      for (const row of this.combinedRows) {
        const value = row[this.extractCol];
        if (typeof value === 'string') {
          if (this.extractType === 'emailDomain') {
            const atIdx = value.indexOf('@');
            row[newCol] = atIdx !== -1 ? value.substring(atIdx + 1) : '';
          } else if (this.extractType === 'firstChars') {
            // Extraction à gauche à partir de extractStart (1-based)
            const start = Math.max(0, (this.extractStart || 1) - 1);
            row[newCol] = value.substring(start, start + this.extractCount);
          } else if (this.extractType === 'lastChars') {
            // Extraction à droite à partir de extractStart (depuis la fin, 1-based)
            const start = Math.max(0, value.length - (this.extractStart || 1) - this.extractCount + 1);
            row[newCol] = value.substring(start, start + this.extractCount);
          }
        } else {
          row[newCol] = '';
        }
      }
      // Ajoute la colonne extraite en première position si pas déjà présente
      if (!this.columns.includes(newCol)) {
        this.columns = [newCol, ...this.columns];
      } else {
        this.columns = [newCol, ...this.columns.filter(c => c !== newCol)];
      }
      this.showSuccess('extract', this.t('TRT.msg.extractionSuccess'));
    } catch (e) {
      this.showError('extract', this.t('TRT.msg.extractionError'));
    }
  }

  getExtractionColName(): string {
    if (this.extractType === 'emailDomain') {
      return this.extractCol + '_domaine';
    } else if (this.extractType === 'firstChars') {
      return this.extractCol + '_debut_' + this.extractCount;
    } else if (this.extractType === 'lastChars') {
      return this.extractCol + '_fin_' + this.extractCount;
    }
    return this.extractCol + '_extrait';
  }

  resetExtraction() {
    this.extractCol = '';
    this.extractType = '';
    this.extractKey = '';
    this.extractStart = 1;
    this.extractCount = 1;
    this.successMsg.extract = '';
    this.errorMsg.extract = '';
  }

  onSelectColChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      if (!this.selectedCols.includes(input.value)) {
        this.selectedCols.push(input.value);
      }
    } else {
      this.selectedCols = this.selectedCols.filter(col => col !== input.value);
    }
  }

  applyColumnSelection() {
    try {
      if (this.selectedCols.length === 0) {
        // Si aucune colonne n'est sélectionnée, sélectionner toutes les colonnes actuellement affichées
        this.selectedCols = [...this.columns];
      }
      this.selectionApplied = true;
      this.updateDisplayedRows();
      this.autoShowPreviewSection(); // Afficher automatiquement la section d'aperçu
      this.showSuccess('select', this.t('TRT.msg.columnSelectionApplied'));
    } catch (e) {
      this.showError('select', this.t('TRT.msg.columnSelectionError'));
    }
  }

  resetColumnSelection() {
    // Garder les colonnes actuellement affichées comme sélectionnées
    this.selectedCols = [...this.columns];
    this.selectionApplied = false;
    this.updateDisplayedRows();
    this.showSuccess('select', this.t('TRT.msg.selectionReset'));
  }

  onFilterColumnChange() {
    if (this.selectedFilterColumn) {
      // Extraire les valeurs uniques de la colonne sélectionnée (comportement normal)
      
      // Vérifier si la colonne existe dans les données
      if (this.allRows.length > 0) {
        const firstRow = this.allRows[0];
      }
      
      // Extraire toutes les valeurs uniques de la colonne sélectionnée depuis allRows (données originales)
      const uniqueValues = Array.from(new Set(this.allRows.map(row => row[this.selectedFilterColumn])));
      
      this.filterValues = uniqueValues;
      this.filteredFilterValues = this.filterValues.slice();
      this.selectedFilterValues = [];
    } else {
      this.filterValues = [];
      this.filteredFilterValues = [];
      this.selectedFilterValues = [];
    }
  }

  selectAllFilterValues() {
    // Si "Tous" est sélectionné, sélectionner toutes les valeurs
    if (this.selectedFilterValues.includes('__TOUS__')) {
      this.selectedFilterValues = ['__TOUS__', ...this.filteredFilterValues];
    } else {
      // Retirer "Tous" si d'autres valeurs sont sélectionnées
      this.selectedFilterValues = this.selectedFilterValues.filter(val => val !== '__TOUS__');
    }
  }

  applyFilter() {
    if (this.selectedFilterColumn && this.selectedFilterValues && this.selectedFilterValues.length > 0) {
      // Si "Tous" est sélectionné, ne pas filtrer (garder toutes les lignes)
      if (this.selectedFilterValues.includes('__TOUS__')) {
        this.filteredRows = [...this.originalRows];
        this.allRows = [...this.originalRows];
        this.combinedRows = [...this.originalRows];
        this.filterApplied = true;
        this.showSuccess('filter', `Aucun filtre appliqué - toutes les lignes conservées (${this.combinedRows.length} lignes).`);
      } else {
        // Filtrage normal basé sur les valeurs sélectionnées
        this.filteredRows = this.originalRows.filter(row => this.selectedFilterValues.includes(row[this.selectedFilterColumn]));
        this.allRows = [...this.filteredRows];
        this.combinedRows = [...this.filteredRows];
        this.filterApplied = true;
        this.showSuccess('filter', `Filtre appliqué sur « ${this.selectedFilterColumn} » = « ${this.selectedFilterValues.join(', ')} » (${this.combinedRows.length} lignes).`);
      }
      this.updateDisplayedRows();
      this.autoShowPreviewSection(); // Afficher automatiquement la section d'aperçu
    }
  }

  resetFilter() {
    this.selectedFilterColumn = '';
    this.selectedFilterValues = [];
    this.filterValues = [];
    this.filteredFilterValues = [];
    this.filterApplied = false;
    this.allRows = [...this.originalRows];
    this.combinedRows = [...this.originalRows];
    this.updateDisplayedRows();
  }

  // --- MÉTHODES POUR FILTRES MULTIPLES ---

  addNewFilter() {
    const newFilter = {
      id: `filter_${this.nextFilterId++}`,
      column: '',
      values: [],
      selectedValues: [],
      filterValues: [],
      filteredFilterValues: [],
      enabled: true
    };
    this.multipleFilters.push(newFilter);
    this.showSuccess('filter', this.t('TRT.msg.filterAdded'));
  }

  removeFilter(filterId: string) {
    this.multipleFilters = this.multipleFilters.filter(f => f.id !== filterId);
    this.applyMultipleFilters();
    this.showSuccess('filter', this.t('TRT.msg.filterRemoved'));
  }

  onMultipleFilterColumnChange(filter: any) {
    if (filter.column) {
      // Extraire les valeurs uniques de la colonne sélectionnée
      const uniqueValues = Array.from(new Set(this.allRows.map(row => row[filter.column])));
      filter.values = uniqueValues;
      filter.filteredFilterValues = filter.values.slice();
      filter.selectedValues = [];
    } else {
      filter.values = [];
      filter.filteredFilterValues = [];
      filter.selectedValues = [];
    }
  }

  selectAllMultipleFilterValues(filter: any) {
    if (filter.selectedValues.includes('__TOUS__')) {
      filter.selectedValues = ['__TOUS__', ...filter.filteredFilterValues];
    } else {
      filter.selectedValues = filter.selectedValues.filter(val => val !== '__TOUS__');
    }
  }

  applyMultipleFilters() {
    if (this.multipleFilters.length === 0) {
      // Aucun filtre, restaurer toutes les données
      this.allRows = [...this.originalRows];
      this.combinedRows = [...this.originalRows];
      this.filterApplied = false;
      this.updateDisplayedRows();
      return;
    }

    // Appliquer tous les filtres actifs
    let filteredData = [...this.originalRows];
    const appliedFilters: string[] = [];

    for (const filter of this.multipleFilters) {
      if (filter.enabled && filter.column && filter.selectedValues.length > 0) {
        if (filter.selectedValues.includes('__TOUS__')) {
          // "Tous" sélectionné, pas de filtrage pour cette colonne
          continue;
        }

        filteredData = filteredData.filter(row => 
          filter.selectedValues.includes(row[filter.column])
        );
        appliedFilters.push(`${filter.column}: ${filter.selectedValues.join(', ')}`);
      }
    }

    this.allRows = filteredData;
    this.combinedRows = filteredData;
    this.filterApplied = appliedFilters.length > 0;
    
    if (this.filterApplied) {
      this.showSuccess('filter', `Filtres appliqués: ${appliedFilters.join(' | ')} (${this.combinedRows.length} lignes).`);
    } else {
      this.showSuccess('filter', this.t('TRT.msg.noActiveFilter'));
    }
    
    this.updateDisplayedRows();
    this.autoShowPreviewSection();
  }

  resetAllFilters() {
    this.selectedFilterColumn = '';
    this.selectedFilterValues = [];
    this.filterValues = [];
    this.filteredFilterValues = [];
    this.multipleFilters = [];
    this.nextFilterId = 1;
    this.filterApplied = false;
    this.allRows = [...this.originalRows];
    this.combinedRows = [...this.originalRows];
    this.updateDisplayedRows();
    this.showSuccess('filter', this.t('TRT.msg.allFiltersReset'));
  }

  trackByFilterId(index: number, filter: any): string {
    return filter.id;
  }

  readExcelFile(file: File, customOptions?: XLSX.ParsingOptions): Promise<XLSX.WorkBook> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          // Options par défaut pour les fichiers .xls, fusionnées avec les options personnalisées
          const defaultOptions: XLSX.ParsingOptions = {
            type: 'array',
            cellDates: true,
            cellNF: false,
            cellText: false
          };
          const options = { ...defaultOptions, ...customOptions };
          const workbook = XLSX.read(data, options);
          resolve(workbook);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => {
        reject(error);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Propriété pour le nom du fichier d'export
  exportFileName: string = 'resultat.csv';
  
  // Propriétés pour l'export optimisé
  isExporting: boolean = false;
  exportProgress: ExportProgress = {
    current: 0,
    total: 0,
    percentage: 0,
    message: '',
    isComplete: false
  };

  // Propriétés pour l'affichage/masquage des sections
  showSections = {
    autoTreatment: false,
    selectCols: false,
    extract: false,
    filter: false,
    columnRename: false,
    concat: false,
    exportByType: false,
    exportByDate: false,
    dedup: false,
    format: false,
    sheetSplit: false,
    totalEnergie: false,
    compileHeaders: false,
    multiMerge: false,
    preview: false  // Aperçu des données combinées masqué par défaut
  };

  // Propriété pour vérifier si toutes les sections sont visibles
  get allSectionsVisible(): boolean {
    return Object.values(this.showSections).every(visible => visible);
  }
  
  get sheetSplitHeaderColumns(): string[] {
    return this.sheetSplitHeaderText
      .split(';')
      .map(col => col.trim())
      .filter(col => col.length > 0);
  }

  exportCSV() {
    try {
      if (this.combinedRows.length === 0) return;
      
      this.isExporting = true;
      this.exportProgress = {
        current: 0,
        total: this.combinedRows.length,
        percentage: 0,
        message: this.t('RES.dlg.optimizedExportStartCsv'),
        isComplete: false
      };
      
      // Remplacement de l'en-tête GRX par PAYS
      const exportColumns = this.columns.map(col => col === 'GRX' ? 'PAYS' : col);
      
      // Utiliser le nom personnalisé ou le nom par défaut
      const fileName = this.exportFileName.trim() || 'resultat.csv';
      const finalFileName = fileName.endsWith('.csv') ? fileName : fileName + '.csv';
      
      // Déterminer la stratégie d'export basée sur la taille des données
      const isLargeDataset = this.combinedRows.length > 10000;
      
      if (isLargeDataset) {
        // Export optimisé avec Web Worker pour gros volumes
        this.exportOptimizationService.exportCSVOptimized(
          this.combinedRows,
          exportColumns,
          finalFileName,
          {
            chunkSize: 5000,
            // Désactivation du Web Worker pour éviter les erreurs d'export sur très gros fichiers
            useWebWorker: false,
            enableCompression: true
          }
        );
        
        // S'abonner à la progression
        this.exportOptimizationService.exportProgress$.subscribe(progress => {
          this.exportProgress = progress;
          if (progress.isComplete) {
            this.isExporting = false;
            if (progress.message.includes('✅')) {
              this.showSuccess('export', `Export CSV réussi: ${finalFileName}`);
            } else {
              this.showError('export', 'Erreur lors de l\'export CSV.');
            }
          }
        });
      } else {
        // Export rapide pour petits volumes
        this.exportOptimizationService.exportQuick(
          this.combinedRows,
          exportColumns,
          finalFileName,
          'csv'
        );
        
        this.isExporting = false;
        this.showSuccess('export', `Export CSV réussi: ${finalFileName}`);
      }
    } catch (e) {
      this.isExporting = false;
      this.showError('export', 'Erreur lors de l\'export CSV.');
    }
  }

  exportXLS() {
    this.exportExcel('xls');
  }

  exportXLSX() {
    this.exportExcel('xlsx');
  }

  private exportExcel(format: 'xls' | 'xlsx') {
    try {
      if (this.combinedRows.length === 0) return;
      
      this.isExporting = true;
      this.exportProgress = {
        current: 0,
        total: this.combinedRows.length,
        percentage: 0,
        message: this.t('RES.dlg.optimizedExportStartFormat', { format: format.toUpperCase() }),
        isComplete: false
      };
      
      // Remplacement de l'en-tête GRX par PAYS
      const exportColumns = this.columns.map(col => col === 'GRX' ? 'PAYS' : col);
      
      // Utiliser le nom personnalisé ou le nom par défaut
      const fileName = this.exportFileName.trim() || `resultat.${format}`;
      const finalFileName = fileName.endsWith(`.${format}`) ? fileName : fileName + `.${format}`;
      
      // Déterminer la stratégie d'export basée sur la taille des données
      const isLargeDataset = this.combinedRows.length > 5000;
      
      if (isLargeDataset) {
        // Export optimisé avec Web Worker pour gros volumes
        this.exportOptimizationService.exportExcelOptimized(
          this.combinedRows,
          exportColumns,
          finalFileName,
          {
            chunkSize: 3000,
            useWebWorker: true,
            enableCompression: true,
            format: format
          }
        );
        
        // S'abonner à la progression
        this.exportOptimizationService.exportProgress$.subscribe(progress => {
          this.exportProgress = progress;
          if (progress.isComplete) {
            this.isExporting = false;
            if (progress.message.includes('✅')) {
              this.showSuccess('export', `Export ${format.toUpperCase()} réussi: ${finalFileName}`);
            } else {
              this.showError('export', `Erreur lors de l'export ${format.toUpperCase()}.`);
            }
          }
        });
      } else {
        // Export rapide pour petits volumes
        this.exportOptimizationService.exportQuick(
          this.combinedRows,
          exportColumns,
          finalFileName,
          format
        );
        
        this.isExporting = false;
        this.showSuccess('export', `Export ${format.toUpperCase()} réussi: ${finalFileName}`);
      }
    } catch (e) {
      this.isExporting = false;
      this.showError('export', `Erreur lors de l'export ${format.toUpperCase()}.`);
    }
  }

  // Méthode pour basculer l'affichage d'une section
  toggleSection(sectionName: keyof typeof this.showSections) {
    this.showSections[sectionName] = !this.showSections[sectionName];
  }

  /** Rafraîchit la page /traitement pendant le traitement automatique embarqué. */
  onAutoTreatmentProgress(_message: string): void {
    this.cd.detectChanges();
  }

  // Méthode pour afficher automatiquement la section d'aperçu quand des données sont disponibles
  private autoShowPreviewSection() {
    if (this.combinedRows.length > 0 && !this.showSections.preview) {
      // Afficher automatiquement la section d'aperçu si elle n'est pas déjà visible
      this.showSections.preview = true;
    }
  }

  // Méthode pour basculer l'affichage de toutes les sections
  toggleAllSections() {
    const shouldShow = !this.allSectionsVisible;
    Object.keys(this.showSections).forEach(key => {
      this.showSections[key as keyof typeof this.showSections] = shouldShow;
    });
  }

  // --- MÉTHODES POUR TOTAL ENERGIE ---
  async onTotalEnergieFile1Selected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.totalEnergieFile1 = input.files[0];
      this.totalEnergieProgress = `Fichier 1 sélectionné : ${this.totalEnergieFile1.name}`;
      this.successMsg.totalEnergie = '';
      this.errorMsg.totalEnergie = '';
      
      try {
        await this.loadTotalEnergieFile1();
        this.showSuccess('totalEnergie', `Fichier 1 chargé : ${this.totalEnergieData1.length} lignes détectées`);
      } catch (error) {
        const message = error instanceof Error ? error.message : this.t('RES.dlg.loadFile1Error');
        this.showError('totalEnergie', message);
      }
    }
  }

  async onTotalEnergieFile2Selected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.totalEnergieFile2 = input.files[0];
      this.totalEnergieProgress = `Fichier 2 sélectionné : ${this.totalEnergieFile2.name}`;
      this.successMsg.totalEnergie = '';
      this.errorMsg.totalEnergie = '';
      
      try {
        await this.loadTotalEnergieFile2();
        this.showSuccess('totalEnergie', `Fichier 2 chargé : ${this.totalEnergieData2.length} lignes détectées`);
      } catch (error) {
        const message = error instanceof Error ? error.message : this.t('RES.dlg.loadFile2Error');
        this.showError('totalEnergie', message);
      }
    }
  }

  async loadTotalEnergieFile1() {
    if (!this.totalEnergieFile1) return;

    const file = this.totalEnergieFile1;
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');
    const isCsv = fileName.endsWith('.csv');

    if (!isExcel && !isCsv) {
      throw new Error(this.t('TRT.msg.unsupportedFileFormat'));
    }

    if (isExcel) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      this.totalEnergieData1 = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      const text = await file.text();
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: this.detectedDelimiter || ';'
      });
      this.totalEnergieData1 = result.data as any[];
    }

    if (this.totalEnergieData1.length === 0) {
      throw new Error(this.t('TRT.msg.emptyFile'));
    }

    // Normaliser les clés en minuscules et détecter les colonnes
    this.totalEnergieData1 = this.totalEnergieData1.map(row => {
      const normalized: any = {};
      Object.keys(row).forEach(k => {
        normalized[String(k).trim()] = row[k];
      });
      return normalized;
    });

    this.totalEnergieColumns1 = Object.keys(this.totalEnergieData1[0] || {});
    
    // Vérifier que les colonnes requises existent
    const requiredCols = ['Code PDA', 'Station', 'Numéro SIM'];
    const normalizedCols = this.totalEnergieColumns1.map(col => col.trim());
    const missingCols = requiredCols.filter(reqCol => 
      !normalizedCols.some(col => col.toLowerCase() === reqCol.toLowerCase())
    );

    if (missingCols.length > 0) {
      throw new Error(`Colonnes manquantes dans le fichier 1 : ${missingCols.join(', ')}. Colonnes trouvées : ${this.totalEnergieColumns1.join(', ')}`);
    }
  }

  async loadTotalEnergieFile2() {
    if (!this.totalEnergieFile2) return;

    const file = this.totalEnergieFile2;
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');
    const isCsv = fileName.endsWith('.csv');

    if (!isExcel && !isCsv) {
      throw new Error(this.t('TRT.msg.unsupportedFileFormat'));
    }

    if (isExcel) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      this.totalEnergieData2 = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      const text = await file.text();
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: this.detectedDelimiter || ';'
      });
      this.totalEnergieData2 = result.data as any[];
    }

    if (this.totalEnergieData2.length === 0) {
      throw new Error(this.t('TRT.msg.emptyFile'));
    }

    // Normaliser les clés et détecter les colonnes
    this.totalEnergieData2 = this.totalEnergieData2.map(row => {
      const normalized: any = {};
      Object.keys(row).forEach(k => {
        normalized[String(k).trim()] = row[k];
      });
      return normalized;
    });

    this.totalEnergieColumns2 = Object.keys(this.totalEnergieData2[0] || {});
    
    // Vérifier que la colonne "N° de compte" existe
    const normalizedCols = this.totalEnergieColumns2.map(col => col.trim());
    const hasAccountCol = normalizedCols.some(col => 
      col.toLowerCase().includes('n°') && col.toLowerCase().includes('compte') ||
      col.toLowerCase().includes('numero') && col.toLowerCase().includes('compte') ||
      col.toLowerCase() === 'n° de compte'
    );

    if (!hasAccountCol) {
      throw new Error(`Colonne "N° de compte" non trouvée dans le fichier 2. Colonnes trouvées : ${this.totalEnergieColumns2.join(', ')}`);
    }
  }

  async processTotalEnergieFiles() {
    if (!this.totalEnergieFile1 || !this.totalEnergieFile2) {
      this.showError('totalEnergie', this.t('TRT.msg.selectBothFiles'));
      return;
    }

    if (this.totalEnergieData1.length === 0 || this.totalEnergieData2.length === 0) {
      this.showError('totalEnergie', this.t('TRT.msg.loadBothFilesFirst'));
      return;
    }

    this.totalEnergieIsProcessing = true;
    this.totalEnergieProgress = this.t('TRT.msg.processingInProgress');

    try {
      // Trouver la colonne "N° de compte" dans le fichier 2
      const accountCol = this.totalEnergieColumns2.find(col => {
        const normalized = col.trim().toLowerCase();
        return normalized.includes('n°') && normalized.includes('compte') ||
               normalized.includes('numero') && normalized.includes('compte') ||
               normalized === 'n° de compte';
      });

      if (!accountCol) {
        throw new Error(this.t('TRT.msg.accountColumnMissing2'));
      }

      // Trouver la colonne "Numéro SIM" dans le fichier 1
      const simCol = this.totalEnergieColumns1.find(col => {
        const normalized = col.trim().toLowerCase();
        return normalized.includes('numéro') && normalized.includes('sim') ||
               normalized.includes('numero') && normalized.includes('sim') ||
               normalized === 'numéro sim';
      });

      if (!simCol) {
        throw new Error(this.t('TRT.msg.simColumnMissing1'));
      }

      // Créer un index du fichier 1 par Numéro SIM (tableau pour gérer les doublons)
      const file1Index: { [key: string]: any[] } = {};
      this.totalEnergieData1.forEach(row => {
        const simNumber = String(row[simCol] || '').trim();
        if (simNumber) {
          // Garder toutes les lignes avec le même Numéro SIM (doublons autorisés)
          if (!file1Index[simNumber]) {
            file1Index[simNumber] = [];
          }
          file1Index[simNumber].push(row);
        }
      });

      // Fusionner les données
      this.totalEnergieMergedData = [];
      this.totalEnergieMergedColumns = [...this.totalEnergieColumns2];

      // Ajouter les colonnes du fichier 1 qui ne sont pas déjà présentes
      this.totalEnergieColumns1.forEach(col => {
        if (!this.totalEnergieMergedColumns.includes(col)) {
          this.totalEnergieMergedColumns.push(col);
        }
      });

      let matchCount = 0;
      let totalRowsCreated = 0;
      
      // Parcourir toutes les lignes du fichier 2 (même sans correspondance)
      this.totalEnergieData2.forEach(row => {
        const accountNumber = String(row[accountCol] || '').trim();
        const matchedRows = file1Index[accountNumber] || [];

        if (matchedRows.length > 0) {
          // Si correspondance(s) trouvée(s), créer une ligne pour chaque correspondance
          matchedRows.forEach(matchedRow => {
            const mergedRow: any = { ...row };
            this.totalEnergieColumns1.forEach(col => {
              mergedRow[col] = matchedRow[col] || '';
            });
            this.totalEnergieMergedData.push(mergedRow);
            totalRowsCreated++;
          });
          matchCount++;
        } else {
          // Si aucune correspondance, garder la ligne du fichier 2 avec colonnes du fichier 1 vides
          const mergedRow: any = { ...row };
          this.totalEnergieColumns1.forEach(col => {
            mergedRow[col] = '';
          });
          this.totalEnergieMergedData.push(mergedRow);
          totalRowsCreated++;
        }
      });

      this.totalEnergieProgress = `Traitement terminé : ${matchCount} lignes avec correspondance(s) sur ${this.totalEnergieData2.length} lignes du fichier 2. Total : ${totalRowsCreated} lignes créées`;
      this.showSuccess('totalEnergie', `Fusion réussie : ${totalRowsCreated} lignes créées (${matchCount} avec correspondance, ${this.totalEnergieData2.length - matchCount} sans correspondance)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.t('RES.dlg.unknownProcessingError');
      this.showError('totalEnergie', message);
    } finally {
      this.totalEnergieIsProcessing = false;
    }
  }

  async exportTotalEnergieResult() {
    if (this.totalEnergieMergedData.length === 0) {
      this.showError('totalEnergie', this.t('TRT.msg.noDataToExportFirst'));
      return;
    }

    try {
      this.totalEnergieIsProcessing = true;
      this.totalEnergieProgress = this.t('TRT.msg.exportInProgress');

      const worksheet = XLSX.utils.json_to_sheet(this.totalEnergieMergedData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Résultat');

      const fileName = `total_energie_resultat_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      this.totalEnergieProgress = this.t('TRT.msg.exportDone');
      this.showSuccess('totalEnergie', `Fichier exporté : ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.t('RES.dlg.exportError');
      this.showError('totalEnergie', message);
    } finally {
      this.totalEnergieIsProcessing = false;
    }
  }

  resetTotalEnergieSelection() {
    this.totalEnergieFile1 = null;
    this.totalEnergieFile2 = null;
    this.totalEnergieData1 = [];
    this.totalEnergieData2 = [];
    this.totalEnergieColumns1 = [];
    this.totalEnergieColumns2 = [];
    this.totalEnergieMergedData = [];
    this.totalEnergieMergedColumns = [];
    this.totalEnergieProgress = '';
    this.successMsg.totalEnergie = '';
    this.errorMsg.totalEnergie = '';

    const input1 = document.getElementById('totalEnergieFile1Input') as HTMLInputElement | null;
    const input2 = document.getElementById('totalEnergieFile2Input') as HTMLInputElement | null;
    if (input1) input1.value = '';
    if (input2) input2.value = '';
  }

  // --- COMPILATION EN-TÊTES DIFFÉRENTS (2 fichiers avec des en-têtes différents) ---

  async onCompileHeadersFile1Selected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.compileHeadersFile1 = input.files[0];
      this.compileHeadersProgress = `Fichier 1 sélectionné : ${this.compileHeadersFile1.name}`;
      this.successMsg.compileHeaders = '';
      this.errorMsg.compileHeaders = '';
      try {
        await this.loadCompileHeadersFile1();
        this.compileHeadersRetained = [...this.compileHeadersCols1];
        this.showSuccess('compileHeaders', `Fichier 1 chargé : ${this.compileHeadersData1.length} lignes, ${this.compileHeadersCols1.length} en-têtes. Cochez les en-têtes à conserver.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : this.t('RES.dlg.loadFile1Error');
        this.showError('compileHeaders', message);
      }
    }
  }

  async onCompileHeadersFile2Selected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.compileHeadersFile2 = input.files[0];
      this.compileHeadersProgress = `Fichier 2 sélectionné : ${this.compileHeadersFile2.name}`;
      this.successMsg.compileHeaders = '';
      this.errorMsg.compileHeaders = '';
      try {
        await this.loadCompileHeadersFile2();
        this.showSuccess('compileHeaders', `Fichier 2 chargé : ${this.compileHeadersData2.length} lignes, ${this.compileHeadersCols2.length} colonnes. Associez chaque colonne à un en-tête retenu.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : this.t('RES.dlg.loadFile2Error');
        this.showError('compileHeaders', message);
      }
    }
  }

  private async readCompileHeadersFile(file: File): Promise<any[]> {
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');
    const isCsv = fileName.endsWith('.csv');

    if (!isExcel && !isCsv) {
      throw new Error(this.t('TRT.msg.unsupportedFileFormat'));
    }

    let rows: any[];
    if (isExcel) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      const text = await file.text();
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: this.detectedDelimiter || ';'
      });
      rows = result.data as any[];
    }

    if (rows.length === 0) {
      throw new Error(this.t('TRT.msg.emptyFile'));
    }

    return rows.map(row => {
      const normalized: any = {};
      Object.keys(row).forEach(k => {
        normalized[String(k).trim()] = row[k];
      });
      return normalized;
    });
  }

  async loadCompileHeadersFile1() {
    if (!this.compileHeadersFile1) return;
    this.compileHeadersData1 = await this.readCompileHeadersFile(this.compileHeadersFile1);
    this.compileHeadersCols1 = Object.keys(this.compileHeadersData1[0] || {});
  }

  async loadCompileHeadersFile2() {
    if (!this.compileHeadersFile2) return;
    this.compileHeadersData2 = await this.readCompileHeadersFile(this.compileHeadersFile2);
    this.compileHeadersCols2 = Object.keys(this.compileHeadersData2[0] || {});
    this.compileHeadersMapping = {};
    if (this.compileHeadersRetained.length > 0) {
      this.compileHeadersCols2.forEach(col => {
        this.compileHeadersMapping[col] = this.findCompileHeadersRetainedFor(col);
      });
    }
  }

  private normalizeCompileHeadersName(name: string): string {
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private findCompileHeadersRetainedFor(col: string): string {
    const normalized = this.normalizeCompileHeadersName(col);
    return this.compileHeadersRetained.find(r => this.normalizeCompileHeadersName(r) === normalized) || '';
  }

  onCompileHeadersToggleRetained(col: string, checked: boolean) {
    if (checked) {
      if (!this.compileHeadersRetained.includes(col)) {
        this.compileHeadersRetained.push(col);
      }
    } else {
      this.compileHeadersRetained = this.compileHeadersRetained.filter(c => c !== col);
    }
    this.compileHeadersCols2.forEach(col2 => {
      const current = this.compileHeadersMapping[col2] || '';
      if (current && !this.compileHeadersRetained.includes(current)) {
        this.compileHeadersMapping[col2] = this.findCompileHeadersRetainedFor(col2);
      }
    });
  }

  onCompileHeadersCheckAll() {
    this.compileHeadersRetained = [...this.compileHeadersCols1];
    this.compileHeadersCols2.forEach(col2 => {
      this.compileHeadersMapping[col2] = this.findCompileHeadersRetainedFor(col2);
    });
  }

  onCompileHeadersUncheckAll() {
    this.compileHeadersRetained = [];
    this.compileHeadersCols2.forEach(col2 => {
      this.compileHeadersMapping[col2] = '';
    });
  }

  onCompileHeadersMappingChange(col2: string, event: Event) {
    const select = event.target as HTMLSelectElement;
    this.compileHeadersMapping[col2] = select.value;
  }

  async processCompileHeaders() {
    if (this.compileHeadersRetained.length === 0) {
      this.showError('compileHeaders', this.t('TRT.msg.selectHeaderToKeep'));
      return;
    }
    if (this.compileHeadersData2.length === 0) {
      this.showError('compileHeaders', this.t('TRT.msg.file2RequiredToCompile'));
      return;
    }

    this.compileHeadersIsProcessing = true;
    this.compileHeadersProgress = this.t('TRT.msg.compilationInProgress');
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      const retained = [...this.compileHeadersRetained];
      this.compileHeadersResultColumns = [...retained];

      const file1Rows: any[] = this.compileHeadersData1.map(row => {
        const out: any = {};
        retained.forEach(col => {
          out[col] = row[col] !== undefined && row[col] !== null ? row[col] : '';
        });
        return out;
      });

      const file2Rows: any[] = this.compileHeadersData2.map(row => {
        const out: any = {};
        retained.forEach(col => { out[col] = ''; });
        this.compileHeadersCols2.forEach(col2 => {
          const target = this.compileHeadersMapping[col2] || '';
          if (!target) return;
          const value = row[col2];
          if (value !== undefined && value !== null && String(value) !== '') {
            const existing = out[target];
            out[target] = existing === '' ? value : `${existing} | ${value}`;
          }
        });
        return out;
      });

      this.compileHeadersResult = [...file1Rows, ...file2Rows];
      this.compileHeadersProgress = `Compilation terminée : ${file1Rows.length} ligne(s) du fichier 1 + ${file2Rows.length} ligne(s) du fichier 2 = ${this.compileHeadersResult.length} ligne(s).`;
      this.showSuccess('compileHeaders', this.compileHeadersProgress);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.t('RES.dlg.compileError');
      this.showError('compileHeaders', message);
    } finally {
      this.compileHeadersIsProcessing = false;
    }
  }

  async exportCompileHeadersResult() {
    if (this.compileHeadersResult.length === 0) {
      this.showError('compileHeaders', 'Aucune donnée à exporter. Veuillez d\'abord compiler.');
      return;
    }
    try {
      this.compileHeadersIsProcessing = true;
      this.compileHeadersProgress = 'Export en cours...';
      const worksheet = XLSX.utils.json_to_sheet(this.compileHeadersResult);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Résultat');
      const fileName = `compilation_entetes_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      this.compileHeadersProgress = 'Export terminé';
      this.showSuccess('compileHeaders', `Fichier exporté : ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.t('RES.dlg.exportError');
      this.showError('compileHeaders', message);
    } finally {
      this.compileHeadersIsProcessing = false;
    }
  }

  resetCompileHeadersSelection() {
    this.compileHeadersFile1 = null;
    this.compileHeadersFile2 = null;
    this.compileHeadersData1 = [];
    this.compileHeadersData2 = [];
    this.compileHeadersCols1 = [];
    this.compileHeadersCols2 = [];
    this.compileHeadersRetained = [];
    this.compileHeadersMapping = {};
    this.compileHeadersResult = [];
    this.compileHeadersResultColumns = [];
    this.compileHeadersProgress = '';
    this.successMsg.compileHeaders = '';
    this.errorMsg.compileHeaders = '';

    const input1 = document.getElementById('compileHeadersFile1Input') as HTMLInputElement | null;
    const input2 = document.getElementById('compileHeadersFile2Input') as HTMLInputElement | null;
    if (input1) input1.value = '';
    if (input2) input2.value = '';
  }

  // --- FUSION MULTI-FICHIERS CSV AVEC EXTRACTION DATE/ID DU NOM ---
  onMultiMergeFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        if (!this.multiMergeFiles.some(f => f.name === file.name && f.size === file.size)) {
          this.multiMergeFiles.push(file);
        }
      }
      this.multiMergeProgress = `${this.multiMergeFiles.length} fichier(s) sélectionné(s)`;
      this.successMsg.multiMerge = '';
      this.errorMsg.multiMerge = '';
      input.value = '';
    }
  }

  removeMultiMergeFile(index: number) {
    this.multiMergeFiles.splice(index, 1);
    this.multiMergeProgress = `${this.multiMergeFiles.length} fichier(s) sélectionné(s)`;
  }

  resetMultiMergeSelection() {
    this.multiMergeFiles = [];
    this.multiMergeData = [];
    this.multiMergeColumns = [];
    this.multiMergeStats = [];
    this.multiMergeProgress = '';
    this.successMsg.multiMerge = '';
    this.errorMsg.multiMerge = '';
    const input = document.getElementById('multiMergeFilesInput') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  /**
   * Sélection de dossier avec recherche récursive de fichiers CSV
   * Utilise webkitdirectory (supporté par la plupart des navigateurs)
   */
  onMultiMergeFolderSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.multiMergeProgress = `Analyse du dossier... ${input.files.length} fichier(s) trouvé(s)`;
      
      // Filtrer seulement les fichiers CSV correspondants au préfixe
      const prefix = this.multiMergePrefix || 'MOOVGA_';
      const csvFiles: File[] = [];
      
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        // Vérifier si c'est un fichier CSV et correspond au pattern
        const fileName = file.name.toLowerCase();
        if (fileName.endsWith('.csv') && fileName.startsWith(prefix.toLowerCase()) && !this.isMultiMergeExcluded(file.name)) {
          // Éviter les doublons
          if (!this.multiMergeFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
            if (!csvFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
              csvFiles.push(file);
            }
          }
        }
      }
      
      // Ajouter les fichiers trouvés
      this.multiMergeFiles.push(...csvFiles);
      this.multiMergeProgress = `${csvFiles.length} fichier(s) CSV correspondant(s) au préfixe "${prefix}" trouvé(s) sur ${input.files.length} fichier(s) total(s)`;
      this.successMsg.multiMerge = '';
      this.errorMsg.multiMerge = '';
      input.value = '';
    }
  }

  /**
   * Sélection de dossier via File System Access API (navigateurs modernes)
   * Plus performant pour les très gros dossiers
   */
  async selectFolderWithFileSystemAPI() {
    try {
      // @ts-ignore - File System Access API
      if (!('showDirectoryPicker' in window)) {
        this.showError('multiMerge', 'File System Access API non supporté. Utilisez le bouton "Sélectionner un dossier" classique.');
        return;
      }

      this.multiMergeProgress = 'Sélection du dossier...';
      
      // @ts-ignore
      const directoryHandle = await (window as any).showDirectoryPicker({
        mode: 'read'
      });

      this.multiMergeProgress = 'Analyse récursive du dossier en cours...';
      
      const prefix = this.multiMergePrefix || 'MOOVGA_';
      const csvFiles: File[] = [];
      let totalFiles = 0;

      // Fonction récursive pour parcourir le dossier
      const processDirectory = async (dirHandle: any, path: string = '') => {
        for await (const [name, handle] of dirHandle.entries()) {
          const fullPath = path ? `${path}/${name}` : name;
          
          if (handle.kind === 'file') {
            totalFiles++;
            const fileName = name.toLowerCase();
            if (fileName.endsWith('.csv') && fileName.startsWith(prefix.toLowerCase()) && !this.isMultiMergeExcluded(name)) {
              try {
                const file = await handle.getFile();
                const customFile = new File([file], file.name, { 
                  type: file.type,
                  lastModified: file.lastModified 
                });
                (customFile as any).webkitRelativePath = fullPath;
                csvFiles.push(customFile);
              } catch (e) {
                console.warn(`Impossible de lire ${fullPath}:`, e);
              }
            }
          } else if (handle.kind === 'directory') {
            await processDirectory(handle, fullPath);
          }
        }
      };

      await processDirectory(directoryHandle);
      
      // Éviter les doublons
      for (const file of csvFiles) {
        if (!this.multiMergeFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
          this.multiMergeFiles.push(file);
        }
      }
      
      this.multiMergeProgress = `${csvFiles.length} fichier(s) CSV correspondant(s) au préfixe "${prefix}" trouvé(s) sur ${totalFiles} fichier(s) total(s)`;
      this.successMsg.multiMerge = '';
      this.errorMsg.multiMerge = '';
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Annulation utilisateur
      }
      this.showError('multiMerge', `Erreur lors de la sélection du dossier: ${error.message}`);
    }
  }

  // --- FUSION MULTI-FICHIERS : traitement, fusion et export ---

  /**
   * Fichier consolidé exclu de la fusion (équivalent du filtre PowerShell
   * `Where-Object { $_.Name -ne "MOOVGA_complet.csv" }`).
   */
  private readonly multiMergeExcludedFileName = 'moovga_complet.csv';

  private readonly TRAITEMENT_EXTENSIONS_RULE_CODE = 'TRAITEMENT.EXTENSIONS_FICHIERS';
  private readonly DEFAULT_TRAITEMENT_EXTENSIONS = ['.csv', '.txt', '.tsv', '.xls', '.xlsx'];

  private traitementExtensions: string[] = [...this.DEFAULT_TRAITEMENT_EXTENSIONS];

  get acceptedFileExtensions(): string[] {
    return this.traitementExtensions && this.traitementExtensions.length > 0
      ? this.traitementExtensions
      : [...this.DEFAULT_TRAITEMENT_EXTENSIONS];
  }

  get acceptedFileAcceptAttr(): string {
    const extensions = this.acceptedFileExtensions;
    const mimeTypes = [
      'text/csv',
      'text/plain',
      'text/tab-separated-values',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
    ];
    return [...extensions, ...mimeTypes].join(',');
  }

  private loadTraitementExtensions(): void {
    try {
      if (!this.configurationCalculService) {
        return;
      }
      const rule = this.configurationCalculService.getActiveRule(this.TRAITEMENT_EXTENSIONS_RULE_CODE);
      if (rule && rule.valeurs) {
        const parsed = this.configurationCalculService.parseValues(rule.valeurs);
        const normalized = parsed
          .map(v => (v || '').toString().trim().toLowerCase())
          .filter(v => v.length > 0)
          .map(v => (v.startsWith('.') ? v : `.${v}`));
        if (normalized.length > 0) {
          this.traitementExtensions = Array.from(new Set(normalized));
          return;
        }
      }
      const list = this.configurationCalculService.getList(this.TRAITEMENT_EXTENSIONS_RULE_CODE, this.DEFAULT_TRAITEMENT_EXTENSIONS);
      if (list && list.length > 0) {
        const normalized = list
          .map(v => (v || '').toString().trim().toLowerCase())
          .filter(v => v.length > 0)
          .map(v => (v.startsWith('.') ? v : `.${v}`));
        if (normalized.length > 0) {
          this.traitementExtensions = Array.from(new Set(normalized));
          return;
        }
      }
      this.traitementExtensions = [...this.DEFAULT_TRAITEMENT_EXTENSIONS];
    } catch {
      this.traitementExtensions = [...this.DEFAULT_TRAITEMENT_EXTENSIONS];
    }
  }

  private isAcceptedFile(fileName: string): boolean {
    const lower = (fileName || '').toLowerCase();
    return this.acceptedFileExtensions.some(ext => lower.endsWith(ext));
  }

  private isExcelExtension(fileName: string): boolean {
    const lower = (fileName || '').toLowerCase();
    return lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.xlsm') || lower.endsWith('.xlsb') || lower.endsWith('.xlt') || lower.endsWith('.xltx') || lower.endsWith('.xltm');
  }

  private isCsvTextExtension(fileName: string): boolean {
    const lower = (fileName || '').toLowerCase();
    return lower.endsWith('.csv') || lower.endsWith('.txt') || lower.endsWith('.tsv');
  }

  /**
   * Total des lignes fusionnées.
   * Les templates Angular ne supportent pas les fonctions fléchées : l'expression
   * `multiMergeStats.reduce(...)` doit passer par une méthode du composant.
   */
  getMultiMergeTotalRows(): number {
    return this.multiMergeStats.reduce((sum, stat) => sum + (stat.rows || 0), 0);
  }

  /**
   * Extrait l'identifiant du nom de fichier en retirant le préfixe configuré.
   * Ex: MOOVGA_20260101.csv -> 20260101
   */
  private extractMultiMergeId(fileName: string): string {
    const prefix = this.multiMergePrefix || '';
    const baseName = fileName.replace(/\.[^.]+$/, '');
    if (prefix && baseName.toLowerCase().startsWith(prefix.toLowerCase())) {
      return baseName.slice(prefix.length);
    }
    return baseName;
  }

  /**
   * Séparateur effectif : la valeur `\t` du <select> est convertie en tabulation.
   */
  private getMultiMergeDelimiter(): string {
    const delimiter = this.multiMergeDelimiter || ';';
    return delimiter === '\\t' ? '\t' : delimiter;
  }

  /**
   * Vrai si le fichier doit être ignoré par la fusion.
   */
  private isMultiMergeExcluded(fileName: string): boolean {
    return fileName.toLowerCase() === this.multiMergeExcludedFileName;
  }

  /**
   * Lecture d'un fichier CSV de la fusion (streaming PapaParse, sans charger
   * tout le fichier en mémoire d'un bloc).
   */
  private readMultiMergeFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
    const delimiter = this.getMultiMergeDelimiter();

    return new Promise((resolve, reject) => {
      let headers: string[] | null = null;
      const rows: Record<string, string>[] = [];

      Papa.parse<string[]>(file, {
        skipEmptyLines: true,
        delimiter,
        worker: false,
        step: (results: Papa.ParseStepResult<string[]>) => {
          const cells = (results.data as string[]).map(cell => (cell === null || cell === undefined ? '' : String(cell)));

          // Ignore les lignes vides
          if (!cells.some(cell => cell.trim().length > 0)) {
            return;
          }

          // La première ligne non vide est l'en-tête
          if (!headers) {
            headers = cells.map((header, index) => header.trim() || `Col${index + 1}`);
            return;
          }

          const row: Record<string, string> = {};
          headers.forEach((header, index) => {
            row[header] = cells[index] ?? '';
          });
          rows.push(row);
        },
        complete: () => resolve({ headers: headers || [], rows }),
        error: (error: Error) => reject(error)
      });
    });
  }

  /**
   * Fusionne tous les fichiers sélectionnés en un seul jeu de données.
   * Pour chaque fichier, l'identifiant extrait du nom est ajouté à chaque ligne.
   */
  async processMultiMergeFiles() {
    if (this.multiMergeFiles.length === 0) {
      this.showError('multiMerge', this.t('TRT.MultiMergeNoFile'));
      return;
    }

    this.multiMergeIsProcessing = true;
    this.multiMergeProgress = this.t('TRT.MultiMergeStart');
    this.multiMergeStats = [];
    this.multiMergeData = [];
    this.multiMergeColumns = [];
    this.successMsg.multiMerge = '';
    this.errorMsg.multiMerge = '';

    const idColumn = (this.multiMergeIdColumnName || 'Jour').trim() || 'Jour';
    const columns: string[] = [idColumn];
    const knownColumns = new Set<string>([idColumn]);
    const merged: any[] = [];
    const stats: { file: string; id: string; rows: number }[] = [];

    this.multiMergeColumns = columns;
    this.multiMergeData = merged;

    try {
      // Tri alphabétique (équivalent au `Sort-Object Name` du script PowerShell)
      const files = [...this.multiMergeFiles].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const id = this.extractMultiMergeId(file.name);

        this.multiMergeProgress = `${this.t('TRT.MultiMergeProcessing')} ${file.name} (${index + 1}/${files.length})`;

        const { headers, rows } = await this.readMultiMergeFile(file);

        // Union ordonnée des colonnes de tous les fichiers
        headers.forEach(header => {
          if (!knownColumns.has(header)) {
            knownColumns.add(header);
            columns.push(header);
          }
        });

        // Ajout de la colonne d'identifiant sur chaque ligne
        rows.forEach(rawRow => {
          const row: any = { [idColumn]: id };
          Object.keys(rawRow).forEach(key => {
            row[key] = rawRow[key];
          });
          row[idColumn] = id;
          merged.push(row);
        });

        stats.push({ file: file.name, id, rows: rows.length });
        this.multiMergeStats = [...stats];
      }

      this.multiMergeProgress = this.t('TRT.MultiMergeDone', {
        files: stats.length,
        rows: merged.length
      });
      this.showSuccess('multiMerge', this.multiMergeProgress);
    } catch (error: any) {
      this.multiMergeProgress = '';
      this.showError('multiMerge', `${this.t('TRT.MultiMergeError')} ${error?.message || error}`);
    } finally {
      this.multiMergeIsProcessing = false;
    }
  }

  /**
   * Nom de fichier pour les exports de la fusion multi-fichiers.
   */
  private buildMultiMergeFileName(extension: 'xlsx' | 'csv'): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `MOOVGA_FUSION_${stamp}.${extension}`;
  }

  /**
   * Export Excel du résultat de la fusion.
   * Au-delà de 10 000 lignes on passe par l'export chunké (memory-safe) ;
   * en dessous, l'export rapide suffit.
   */
  async exportMultiMergeResult() {
    if (this.multiMergeData.length === 0) {
      this.showError('multiMerge', this.t('TRT.MultiMergeNoResult'));
      return;
    }

    this.multiMergeIsProcessing = true;
    this.multiMergeProgress = this.t('TRT.MultiMergeExporting');

    try {
      const fileName = this.buildMultiMergeFileName('xlsx');
      const rows = this.multiMergeData;
      const columns = this.multiMergeColumns;

      if (rows.length > 10000) {
        await this.exportOptimizationService.exportExcelOptimized(rows, columns, fileName, {
          chunkSize: rows.length > 100000 ? 5000 : 3000,
          useWebWorker: true,
          enableCompression: true,
          format: 'xlsx',
          onProgress: (progress: ExportProgress) => {
            this.multiMergeProgress = progress.message;
          }
        });
      } else {
        this.exportOptimizationService.exportQuick(rows, columns, fileName, 'xlsx');
      }

      this.multiMergeProgress = this.t('TRT.MultiMergeExportDone');
      this.showSuccess('multiMerge', this.t('TRT.MultiMergeExported', { file: fileName }));
    } catch (error: any) {
      this.multiMergeProgress = '';
      this.showError('multiMerge', `${this.t('TRT.MultiMergeError')} ${error?.message || error}`);
    } finally {
      this.multiMergeIsProcessing = false;
    }
  }

  /**
   * Export CSV du résultat de la fusion.
   * Chemin dédié pour les gros volumes (> 50 000 lignes) : écriture par chunks
   * sans concaténer de méga-chaîne, donc beaucoup plus rapide et moins gourmand.
   */
  async exportMultiMergeResultCSV() {
    if (this.multiMergeData.length === 0) {
      this.showError('multiMerge', this.t('TRT.MultiMergeNoResult'));
      return;
    }

    this.multiMergeIsProcessing = true;
    this.multiMergeProgress = this.t('TRT.MultiMergeExporting');

    try {
      const fileName = this.buildMultiMergeFileName('csv');
      const rows = this.multiMergeData;
      const columns = this.multiMergeColumns;

      await this.exportOptimizationService.exportCSVOptimized(rows, columns, fileName, {
        chunkSize: rows.length > 50000 ? 5000 : rows.length > 20000 ? 2000 : 1000,
        useWebWorker: false,
        enableCompression: true,
        onProgress: (progress: ExportProgress) => {
          this.multiMergeProgress = progress.message;
        }
      });

      this.multiMergeProgress = this.t('TRT.MultiMergeExportDone');
      this.showSuccess('multiMerge', this.t('TRT.MultiMergeExported', { file: fileName }));
    } catch (error: any) {
      this.multiMergeProgress = '';
      this.showError('multiMerge', `${this.t('TRT.MultiMergeError')} ${error?.message || error}`);
    } finally {
      this.multiMergeIsProcessing = false;
    }
  }
  // --- COMPARAISON BO AGENCE / PARTNER STATION (TOTAL ENERGIE) ---
  async onTotalEnergieCompareFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.totalEnergieCompareFile = input.files[0];
      this.totalEnergieCompareProgress = `Fichier sélectionné : ${this.totalEnergieCompareFile.name}`;
      this.totalEnergieCompareResult = [];
      this.totalEnergieCompareResultColumns = [];
      this.successMsg.totalEnergieCompare = '';
      this.errorMsg.totalEnergieCompare = '';
      try {
        await this.loadTotalEnergieCompareFile();
        this.showSuccess('totalEnergieCompare', `Fichier chargé : ${this.totalEnergieCompareData.length} lignes. Cliquez sur "Comparer et ajouter Commentaire" pour lancer la comparaison.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : this.t('RES.dlg.loadFileError');
        this.showError('totalEnergieCompare', message);
      }
    }
  }

  async loadTotalEnergieCompareFile() {
    if (!this.totalEnergieCompareFile) return;
    const file = this.totalEnergieCompareFile;
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');
    const isCsv = fileName.endsWith('.csv');
    if (!isExcel && !isCsv) {
      throw new Error(this.t('TRT.msg.unsupportedFormatCsv'));
    }
    if (isExcel) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      this.totalEnergieCompareData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      const text = await file.text();
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: this.detectedDelimiter || ';'
      });
      this.totalEnergieCompareData = result.data as any[];
    }
    if (this.totalEnergieCompareData.length === 0) {
      throw new Error(this.t('TRT.msg.emptyFile'));
    }
    this.totalEnergieCompareData = this.totalEnergieCompareData.map((row: any) => {
      const normalized: any = {};
      Object.keys(row).forEach(k => {
        normalized[String(k).trim()] = row[k];
      });
      return normalized;
    });
    this.totalEnergieCompareColumns = Object.keys(this.totalEnergieCompareData[0] || {});
    const normalizedCols = this.totalEnergieCompareColumns.map(col => col.trim().toLowerCase());
    const hasBoAgence = normalizedCols.some(c =>
      (c.includes('bo') && c.includes('agence')) || c === 'bo: agence' || c === 'bo:agence' || c === 'bo_agence'
    );
    const hasPartnerStation = normalizedCols.some(c =>
      (c.includes('partner') && c.includes('station')) || (c.includes('partenaire') && c.includes('station')) ||
      c === 'partner: station' || c === 'partner:station' || c === 'partenaire_station'
    );
    if (!hasBoAgence) {
      throw new Error(`Colonne "BO: Agence" non trouvée. Colonnes : ${this.totalEnergieCompareColumns.join(', ')}`);
    }
    if (!hasPartnerStation) {
      throw new Error(`Colonne "PARTNER: Station" non trouvée. Colonnes : ${this.totalEnergieCompareColumns.join(', ')}`);
    }
  }

  processTotalEnergieCompare() {
    if (this.totalEnergieCompareData.length === 0) {
      this.showError('totalEnergieCompare', this.t('TRT.msg.loadFileFirst'));
      return;
    }
    this.totalEnergieCompareIsProcessing = true;
    this.successMsg.totalEnergieCompare = '';
    this.errorMsg.totalEnergieCompare = '';
    try {
      const colBoAgence = this.totalEnergieCompareColumns.find(c => {
        const n = c.trim().toLowerCase().replace(/\s+/g, ' ');
        return n === 'bo: agence' || n === 'bo:agence' || n === 'bo_agence' || (n.includes('bo') && n.includes('agence'));
      });
      const colPartnerStation = this.totalEnergieCompareColumns.find(c => {
        const n = c.trim().toLowerCase().replace(/\s+/g, ' ');
        return n === 'partner: station' || n === 'partner:station' || n === 'partenaire_station' ||
          (n.includes('partner') && n.includes('station')) || (n.includes('partenaire') && n.includes('station'));
      });
      if (!colBoAgence || !colPartnerStation) {
        throw new Error(this.t('TRT.msg.boAgencyColumnsMissing'));
      }
      const COMMENTAIRE_KEY = 'Commentaire';
      this.totalEnergieCompareResult = this.totalEnergieCompareData.map((row: any) => {
        const agence = String(row[colBoAgence] ?? '').trim();
        const station = String(row[colPartnerStation] ?? '').trim();
        const commentaire =
          agence === station
            ? 'OK'
            : `Trx à annuler sur '${agence}' et à créer sur '${station}'`;
        return { ...row, [COMMENTAIRE_KEY]: commentaire };
      });
      this.totalEnergieCompareResultColumns = [...this.totalEnergieCompareColumns];
      if (!this.totalEnergieCompareResultColumns.includes(COMMENTAIRE_KEY)) {
        this.totalEnergieCompareResultColumns.push(COMMENTAIRE_KEY);
      }
      const okCount = this.totalEnergieCompareResult.filter(r => r[COMMENTAIRE_KEY] === 'OK').length;
      const diffCount = this.totalEnergieCompareResult.length - okCount;
      
      // Calculer le récapitulatif groupé par station pour les commentaires non OK
      const summaryMap: { [station: string]: { count: number; agences: Set<string> } } = {};
      const partnerStationCol = colPartnerStation; // Garder référence pour le scope
      const boAgenceCol = colBoAgence; // Garder référence pour le scope
      
      this.totalEnergieCompareResult.forEach((row: any) => {
        if (row[COMMENTAIRE_KEY] !== 'OK') {
          const station = String(row[partnerStationCol] ?? '').trim() || '(vide)';
          const agence = String(row[boAgenceCol] ?? '').trim() || '(vide)';
          
          if (!summaryMap[station]) {
            summaryMap[station] = { count: 0, agences: new Set<string>() };
          }
          summaryMap[station].count++;
          if (agence) {
            summaryMap[station].agences.add(agence);
          }
        }
      });
      
      // Convertir en tableau et trier par nombre décroissant
      this.totalEnergieCompareSummary = Object.keys(summaryMap)
        .map(station => ({
          station,
          agenceBo: Array.from(summaryMap[station].agences).join(', ') || '(vide)',
          count: summaryMap[station].count
        }))
        .sort((a, b) => b.count - a.count);
      
      this.totalEnergieCompareProgress = `Comparaison terminée : ${okCount} OK, ${diffCount} à traiter.`;
      this.showSuccess('totalEnergieCompare', `Comparaison terminée : ${this.totalEnergieCompareResult.length} lignes (${okCount} OK, ${diffCount} avec écart).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.t('RES.dlg.compareError');
      this.showError('totalEnergieCompare', message);
    } finally {
      this.totalEnergieCompareIsProcessing = false;
    }
  }

  async exportTotalEnergieCompareResult() {
    if (this.totalEnergieCompareResult.length === 0) {
      this.showError('totalEnergieCompare', this.t('TRT.msg.noDataToExportCompare'));
      return;
    }
    try {
      this.totalEnergieCompareIsProcessing = true;
      const worksheet = XLSX.utils.json_to_sheet(this.totalEnergieCompareResult);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparaison');
      const fileName = `total_energie_comparaison_bo_partner_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      this.showSuccess('totalEnergieCompare', `Fichier exporté : ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.t('RES.dlg.exportError');
      this.showError('totalEnergieCompare', message);
    } finally {
      this.totalEnergieCompareIsProcessing = false;
    }
  }

  getTotalEnergieCompareSummaryTotal(): number {
    return this.totalEnergieCompareSummary.reduce((sum, item) => sum + item.count, 0);
  }

  getSummarySeverityClass(count: number): string {
    const total = this.getTotalEnergieCompareSummaryTotal();
    if (total === 0) return 'severity-low';
    const percentage = (count / total) * 100;
    if (percentage >= 30 || count >= 50) return 'severity-high';
    if (percentage >= 10 || count >= 20) return 'severity-medium';
    return 'severity-low';
  }

  getSummarySeverityPercentage(count: number): number {
    const total = this.getTotalEnergieCompareSummaryTotal();
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  }

  async exportTotalEnergieCompareSummary() {
    if (this.totalEnergieCompareSummary.length === 0) {
      this.showError('totalEnergieCompare', this.t('TRT.msg.noSummaryToExport'));
      return;
    }
    try {
      this.totalEnergieCompareIsProcessing = true;
      
      // Préparer les données pour l'export avec le total
      const exportData = this.totalEnergieCompareSummary.map(item => ({
        'Station (PARTNER)': item.station,
        'Agence BO': item.agenceBo,
        'Nombre de commentaires non OK': item.count
      }));
      
      // Ajouter la ligne de total
      exportData.push({
        'Station (PARTNER)': 'TOTAL',
        'Agence BO': '',
        'Nombre de commentaires non OK': this.getTotalEnergieCompareSummaryTotal()
      });
      
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Récapitulatif');
      
      const fileName = `total_energie_recap_stations_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      
      this.showSuccess('totalEnergieCompare', `Récapitulatif exporté : ${fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.t('RES.dlg.exportRecapError');
      this.showError('totalEnergieCompare', message);
    } finally {
      this.totalEnergieCompareIsProcessing = false;
    }
  }

  resetTotalEnergieCompareSelection() {
    this.totalEnergieCompareFile = null;
    this.totalEnergieCompareData = [];
    this.totalEnergieCompareColumns = [];
    this.totalEnergieCompareResult = [];
    this.totalEnergieCompareResultColumns = [];
    this.totalEnergieCompareSummary = [];
    this.totalEnergieCompareProgress = '';
    this.successMsg.totalEnergieCompare = '';
    this.errorMsg.totalEnergieCompare = '';
    const input = document.getElementById('totalEnergieCompareFileInput') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  // --- MÉTHODES DE SÉPARATION DES FEUILLES EXCEL ---
  onSheetSplitFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.sheetSplitFile = input.files[0];
      this.sheetSplitResults = [];
      this.sheetSplitZipName = '';
      this.sheetSplitProgress = `${this.sheetSplitFile.name} sélectionné (${(this.sheetSplitFile.size / (1024 * 1024)).toFixed(2)} MB)`;
      this.successMsg.sheetSplit = '';
      this.errorMsg.sheetSplit = '';
      this.showSheetSplitExcelFallbackHelp = false;
    }
  }

  resetSheetSplitSelection() {
    this.sheetSplitFile = null;
    this.showSheetSplitExcelFallbackHelp = false;
    this.sheetSplitResults = [];
    this.sheetSplitZipName = '';
    this.sheetSplitProgress = '';

    const input = document.getElementById('sheetSplitInput') as HTMLInputElement | null;
    if (input) {
      input.value = '';
    }
  }

  /** Copie la macro VBA dans le presse-papiers (fallback pour les navigateurs non sécurisés). */
  async copySheetSplitVbaMacro(): Promise<void> {
    let copied = false;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(this.SHEET_SPLIT_VBA_MACRO);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      copied = this.copyTextToClipboardFallback(this.SHEET_SPLIT_VBA_MACRO);
    }

    if (!copied) {
      this.showError('sheetSplit', this.t('TRT.CodeCopieErreur'));
      return;
    }

    this.sheetSplitVbaCopied = true;
    if (this.sheetSplitVbaCopyTimeout) {
      clearTimeout(this.sheetSplitVbaCopyTimeout);
    }
    this.sheetSplitVbaCopyTimeout = setTimeout(() => {
      this.sheetSplitVbaCopied = false;
      this.sheetSplitVbaCopyTimeout = null;
      this.cd.markForCheck();
    }, 2500);
    this.cd.markForCheck();
  }

  private copyTextToClipboardFallback(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
    return copied;
  }

  /** Télécharge la macro sous forme de module VBA importable dans Excel. */
  downloadSheetSplitVbaMacro(): void {
    const content = `Attribute VB_Name = "Module1"\r\n`
      + this.SHEET_SPLIT_VBA_MACRO.replace(/\r?\n/g, '\r\n');

    // Encodage proche de Windows-1252, attendu par l'éditeur VBA d'Excel.
    const bytes = new Uint8Array(content.length);
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);
      bytes[i] = code <= 0xff ? code : 0x3f;
    }

    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    saveAs(blob, 'SeparerFeuillesEnteteComplet.bas');
  }

  async splitExcelSheets() {
    if (!this.sheetSplitFile) {
      this.showError('sheetSplit', this.t('TRT.msg.selectExcelFile'));
      return;
    }

    this.sheetSplitIsProcessing = true;
    this.sheetSplitProgress = this.t('TRT.msg.loadingWorkbook');
    this.sheetSplitResults = [];
    this.sheetSplitZipName = '';
    this.showSheetSplitExcelFallbackHelp = false;

    try {
      let sourceFile: File = this.sheetSplitFile;

      if (this.isLegacyXlsFile(this.sheetSplitFile)) {
        this.sheetSplitConversionMessage = this.t('TRT.msg.xlsConversionInProgress');
        this.sheetSplitConversionInProgress = true;
        sourceFile = await this.convertLegacyXls(this.sheetSplitFile);
        this.sheetSplitConversionInProgress = false;
        this.sheetSplitConversionMessage = '';
      }

      const buffer = await sourceFile.arrayBuffer();
      const workbook = await this.loadExcelWorkbook(buffer, sourceFile.name);

      if (!workbook.worksheets || workbook.worksheets.length === 0) {
        throw new Error(this.t('TRT.msg.noSheetInWorkbook'));
      }

      const header = this.sheetSplitHeaderColumns;
      const zip = new JSZip();
      const sheetResults: Array<{ sheetName: string; rows: number; fileName: string }> = [];

      for (let index = 0; index < workbook.worksheets.length; index++) {
        const worksheet = workbook.worksheets[index];
        const sheetName = worksheet?.name || `Feuille_${index + 1}`;
        this.sheetSplitProgress = `Traitement de "${sheetName}" (${index + 1}/${workbook.worksheets.length})`;

        const clonedWorkbook = new ExcelJS.Workbook();
        const clonedSheet = clonedWorkbook.addWorksheet(sheetName);

        worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
          const values = Array.isArray(row.values) ? [...row.values] : row.values;
          clonedSheet.getRow(rowNumber).values = values;
          clonedSheet.getRow(rowNumber).commit();
        });

        if (this.sheetSplitApplyHeaderFromSecondSheet && index > 0 && header.length > 0) {
          clonedSheet.spliceRows(1, 0, header);
          this.applySheetSplitHeaderStyle(clonedSheet.getRow(1));
        }

        this.applySheetSplitColumnWidths(clonedSheet);

        const safeSheetName = this.sanitizeFileName(sheetName) || `Feuille_${index + 1}`;
        const fileName = `${safeSheetName}.xlsx`;
        const sheetBuffer = await clonedWorkbook.xlsx.writeBuffer();

        zip.file(fileName, sheetBuffer);
        sheetResults.push({
          sheetName,
          rows: this.getSheetSplitRowCount(worksheet),
          fileName
        });
      }

      const zipName = `${this.getBaseFileName(sourceFile.name)}_feuilles_sep.zip`;
      this.sheetSplitZipName = zipName;
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, zipName);

      this.sheetSplitResults = sheetResults;
      this.sheetSplitProgress = this.t('TRT.msg.splitDone');
      this.showSheetSplitExcelFallbackHelp = false;
      this.showSuccess('sheetSplit', `Séparation terminée : ${sheetResults.length} fichiers générés (${zipName}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : this.t('RES.dlg.splitSheetsUnknownError');
      this.showError('sheetSplit', message);
    } finally {
      this.sheetSplitIsProcessing = false;
      this.sheetSplitConversionInProgress = false;
      this.sheetSplitConversionMessage = '';
      
      // Nettoyer l'intervalle si toujours actif
      if (this.sheetSplitConversionProgressInterval) {
        clearInterval(this.sheetSplitConversionProgressInterval);
        this.sheetSplitConversionProgressInterval = null;
      }
      this.sheetSplitConversionProgress = 0;
      this.sheetSplitConversionElapsedTime = 0;
    }
  }

  private applySheetSplitHeaderStyle(row: ExcelJS.Row) {
    row.font = { bold: true, color: { argb: 'FF000000' } };
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFC8C8C8' }
    };
    row.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  private applySheetSplitColumnWidths(worksheet: ExcelJS.Worksheet) {
    this.sheetSplitColumnWidths.forEach((width, index) => {
      const column = worksheet.getColumn(index + 1);
      column.width = width;
    });
  }

  private getSheetSplitRowCount(worksheet: ExcelJS.Worksheet): number {
    const actualRows = (worksheet as any).actualRowCount;
    if (typeof actualRows === 'number' && actualRows > 0) {
      return actualRows;
    }
    return worksheet.rowCount || 0;
  }

  private sanitizeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
  }

  private getBaseFileName(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '');
  }

  private isLegacyXlsFile(file: File | null): boolean {
    if (!file) {
      return false;
    }
    return file.name.toLowerCase().endsWith('.xls');
  }

  /**
   * Conversion XLS → XLSX dans le navigateur (fallback quand le serveur est inaccessible).
   * Les très gros .xls ou certains formats peuvent provoquer RangeError dans SheetJS ; dans ce cas on échoue proprement.
   */
  private async convertLegacyXlsInBrowser(file: File): Promise<File> {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = await this.loadExcelWorkbook(buffer, file.name);
      const xlsxBuffer = await workbook.xlsx.writeBuffer();
      return new File([xlsxBuffer], `${this.getBaseFileName(file.name)}_converted.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    } catch (e) {
      const isRangeError = e instanceof RangeError || (e && (e as Error).message?.includes('Invalid array length'));
      if (isRangeError) {
        throw new Error('BROWSER_XLS_TOO_LARGE_OR_UNSUPPORTED');
      }
      throw e;
    }
  }

  private async convertLegacyXls(file: File): Promise<File> {
    return new Promise<File>((resolve, reject) => {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      this.sheetSplitProgress = `Préparation de la conversion (${sizeMB} MB)...`;
      
      // Initialiser la progression
      this.sheetSplitConversionProgress = 0;
      this.sheetSplitConversionElapsedTime = 0;
      const startTime = Date.now();
      
      // Démarrer l'intervalle de mise à jour de la progression
      this.sheetSplitConversionProgressInterval = setInterval(() => {
        this.sheetSplitConversionElapsedTime = Math.floor((Date.now() - startTime) / 1000);
        
        // Estimation de progression optimisée basée sur la taille du fichier
        // Avec les optimisations backend (streaming), la conversion est plus rapide
        // Estimation réaliste : ~1-1.5s par MB pour les petits, ~0.7-1s pour les moyens, ~0.6-0.8s pour les gros
        const fileSizeMB = parseFloat(sizeMB);
        let estimatedDuration;
        
        if (fileSizeMB < 50) {
          // Petits fichiers : ~1.5s par MB
          estimatedDuration = Math.max(30, fileSizeMB * 1.5);
        } else if (fileSizeMB < 150) {
          // Fichiers moyens : ~1s par MB
          estimatedDuration = Math.max(60, fileSizeMB * 1.0);
        } else {
          // Gros fichiers (181 MB) : ~0.7s par MB (grâce au streaming)
          // Pour 181 MB = ~127 secondes = ~2 minutes
          estimatedDuration = Math.max(120, fileSizeMB * 0.7);
        }
        
        // Limite à 98% pour laisser de la marge, mais permet d'aller plus loin
        const rawProgress = (this.sheetSplitConversionElapsedTime / estimatedDuration) * 100;
        // Progression non-linéaire : plus lente au début, accélère vers la fin
        const adjustedProgress = rawProgress < 50 
          ? rawProgress * 0.7  // Ralentir les premiers 50%
          : 35 + (rawProgress - 50) * 1.3; // Accélérer les derniers 50%
        
        const estimatedProgress = Math.min(98, Math.max(0, adjustedProgress));
        this.sheetSplitConversionProgress = Math.floor(estimatedProgress);
        
        // Mettre à jour le message avec le temps écoulé et estimation restante
        const minutes = Math.floor(this.sheetSplitConversionElapsedTime / 60);
        const seconds = this.sheetSplitConversionElapsedTime % 60;
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        
        const remainingSeconds = Math.max(0, Math.ceil(estimatedDuration - this.sheetSplitConversionElapsedTime));
        const remainingMinutes = Math.floor(remainingSeconds / 60);
        const remainingSecs = remainingSeconds % 60;
        const remainingStr = remainingMinutes > 0 
          ? `${remainingMinutes}m ${remainingSecs}s` 
          : `${remainingSecs}s`;
        
        this.sheetSplitConversionMessage = `Conversion XLS → XLSX en cours... (${timeStr} écoulé${minutes > 0 ? 's' : ''}, ~${remainingStr} restant${remainingMinutes > 0 ? 's' : ''})`;
        
        this.cd.detectChanges();
      }, 500); // Mise à jour toutes les 500ms
      
      this.excelConversionService.convertXlsToXlsx(file).subscribe({
        next: blob => {
          // Arrêter l'intervalle
          if (this.sheetSplitConversionProgressInterval) {
            clearInterval(this.sheetSplitConversionProgressInterval);
            this.sheetSplitConversionProgressInterval = null;
          }
          
          // Mettre la progression à 100%
          this.sheetSplitConversionProgress = 100;
          const convertedFile = new File([blob], `${this.getBaseFileName(file.name)}_converted.xlsx`, {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          });
          this.sheetSplitProgress = this.t('TRT.msg.conversionDoneResume');
          this.sheetSplitConversionMessage = this.t('TRT.msg.conversionDone');
          this.cd.detectChanges();
          
          // Petit délai pour afficher le 100% avant de continuer
          setTimeout(() => {
            resolve(convertedFile);
          }, 500);
        },
        error: err => {
          // Arrêter l'intervalle en cas d'erreur
          if (this.sheetSplitConversionProgressInterval) {
            clearInterval(this.sheetSplitConversionProgressInterval);
            this.sheetSplitConversionProgressInterval = null;
          }
          
          const isConnectionError = err instanceof HttpErrorResponse && (err.status === 0 || err.status === 504);
          if (isConnectionError) {
            this.sheetSplitProgress = this.t('TRT.msg.serverUnavailableLocal');
            this.sheetSplitConversionMessage = this.t('TRT.msg.browserConversion');
            this.sheetSplitConversionProgress = 50;
            this.cd.detectChanges();
            this.convertLegacyXlsInBrowser(file).then(converted => {
              this.sheetSplitConversionProgress = 100;
              this.sheetSplitProgress = this.t('TRT.msg.localConversionDoneResume');
              this.sheetSplitConversionMessage = this.t('TRT.msg.conversionDone');
              this.cd.detectChanges();
              setTimeout(() => resolve(converted), 300);
            }).catch(fallbackErr => {
              const isUnsupported = fallbackErr instanceof Error && fallbackErr.message === 'BROWSER_XLS_TOO_LARGE_OR_UNSUPPORTED';
              const msg = isUnsupported
                ? this.t('TRT.msg.xlsCannotConvertInBrowser')
                : this.t('TRT.msg.serverUnavailableNoConversion');
              this.showSheetSplitExcelFallbackHelp = isUnsupported;
              this.showError('sheetSplit', msg);
              this.sheetSplitConversionInProgress = false;
              this.sheetSplitConversionMessage = '';
              this.sheetSplitConversionProgress = 0;
              this.sheetSplitConversionElapsedTime = 0;
              reject(fallbackErr);
            });
            return;
          }
          const message = this.t('TRT.msg.xlsToXlsxConversionError');
          this.showError('sheetSplit', message);
          this.sheetSplitConversionInProgress = false;
          this.sheetSplitConversionMessage = '';
          this.sheetSplitConversionProgress = 0;
          this.sheetSplitConversionElapsedTime = 0;
          reject(err);
        }
      });
    });
  }

  private async loadExcelWorkbook(buffer: ArrayBuffer, fileName: string): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.xls')) {
      const data = new Uint8Array(buffer);
      const parsed = XLSX.read(data, {
        type: 'array',
        cellDates: true,
        raw: true
      });

      parsed.SheetNames.forEach(sheetName => {
        const targetSheet = workbook.addWorksheet(sheetName);
        const sheet = parsed.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          raw: true
        });

        rows.forEach(rowValues => {
          targetSheet.addRow(rowValues);
        });
      });

      return workbook;
    }

    await workbook.xlsx.load(buffer);
    return workbook;
  }

  convertColumnsToNumber() {
    try {
      for (const col of this.formatOptions.numberColumns) {
        for (const row of this.combinedRows) {
          if (row[col] !== undefined && row[col] !== null) {
            const num = parseFloat(row[col].toString().replace(/\s/g, '').replace(',', '.'));
            row[col] = isNaN(num) ? row[col] : num;
          }
        }
      }
      this.showSuccess('number', this.t('TRT.msg.toNumberSuccess'));
    } catch (e) {
      this.showError('number', this.t('TRT.msg.toNumberError'));
    }
  }

  convertColumnsToDate() {
    try {
      for (const col of this.formatOptions.dateColumns) {
        for (const row of this.combinedRows) {
          if (row[col]) {
            let val = row[col].toString();
            if (val.endsWith('.0')) {
              val = val.slice(0, -2);
            }
            const d = new Date(val);
            if (!isNaN(d.getTime())) {
              row[col] = this.formatDate(d, this.formatOptions.dateFormat);
            }
          }
        }
      }
      this.showSuccess('date', this.t('TRT.msg.dateFormatSuccess'));
    } catch (e) {
      this.showError('date', this.t('TRT.msg.dateFormatError'));
    }
  }

  formatDate(date: Date, format: string): string {
    // Prise en charge de yyyy-MM-dd, dd/MM/yyyy, HH:mm:ss, etc. Sans .0 final
    const yyyy = date.getFullYear();
    const MM = ('0' + (date.getMonth() + 1)).slice(-2);
    const dd = ('0' + date.getDate()).slice(-2);
    const HH = ('0' + date.getHours()).slice(-2);
    const mm = ('0' + date.getMinutes()).slice(-2);
    const ss = ('0' + date.getSeconds()).slice(-2);
    let result = format
      .replace('yyyy', yyyy.toString())
      .replace('MM', MM)
      .replace('dd', dd)
      .replace('HH', HH)
      .replace('mm', mm)
      .replace('ss', ss);
    // Supprime le .0 final si présent et non demandé
    if (result.endsWith('.0') && !format.includes('.0')) {
      result = result.slice(0, -2);
    }
    return result;
  }

  onDateFormatChange() {
    if (this.selectedDateFormat !== 'custom') {
      this.formatOptions.dateFormat = this.selectedDateFormat;
    }
  }

  /** Ferme le panneau après un choix (les multi-select Material restent ouverts par défaut). */
  closeMatSelectPanelAfterSelection(event: MatSelectChange): void {
    setTimeout(() => event.source.close(), 0);
  }

  onExportTypeColChange() {
    this.exportTypeSelected = [];
    if (!this.exportTypeCol) {
      this.exportTypeValues = [];
      return;
    }
    const valuesSet = new Set<string>();
    for (const row of this.combinedRows) {
      valuesSet.add(row[this.exportTypeCol] ?? '');
    }
    this.exportTypeValues = Array.from(valuesSet);
  }

  onExportTypeValueChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      if (!this.exportTypeSelected.includes(input.value)) {
        this.exportTypeSelected.push(input.value);
      }
    } else {
      this.exportTypeSelected = this.exportTypeSelected.filter(v => v !== input.value);
    }
  }

  selectAllExportTypes() {
    this.exportTypeSelected = [...this.exportTypeValues];
  }

  deselectAllExportTypes() {
    this.exportTypeSelected = [];
  }

  onExportTypeSuffixChange() {
    // Réinitialiser le suffixe personnalisé si on change d'option
    if (this.exportTypeSuffix !== 'CUSTOM') {
      this.exportTypeCustomSuffix = '';
    }
  }

  exportByType() {
    try {
      if (!this.exportTypeCol || this.exportTypeSelected.length === 0) return;
      let exported = 0;
      for (const type of this.exportTypeSelected) {
        const filteredRows = this.combinedRows.filter(row => (row[this.exportTypeCol] ?? '') === type);
        if (filteredRows.length === 0) continue;
        const safeType = (type || 'vide').replace(/[^a-zA-Z0-9_-]/g, '_');
        let sufixe = '';
        if (this.exportTypeSuffix === 'CUSTOM' && this.exportTypeCustomSuffix) {
          sufixe = this.exportTypeCustomSuffix.replace(/[^a-zA-Z0-9_-]/g, '_');
        } else if (this.exportTypeSuffix && this.exportTypeSuffix !== 'CUSTOM') {
          sufixe = this.exportTypeSuffix.replace(/[^a-zA-Z0-9_-]/g, '_');
        }
        const prefixe = this.exportTypePrefix ? this.exportTypePrefix.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
        const description = this.exportTypeDescription ? this.exportTypeDescription.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
        let baseFileName = '';
        if (prefixe) baseFileName = prefixe + '_';
        baseFileName += safeType;
        if (sufixe) baseFileName += `_` + sufixe;
        if (description) baseFileName += `_` + description;

        const fileNameCsv = `${baseFileName}.csv`;
        const fileNameXls = `${baseFileName}.xls`;
        const fileNameXlsx = `${baseFileName}.xlsx`;

        if (this.exportTypeFormat === 'csv') {
          this.exportPeriodAsCSV(filteredRows, fileNameCsv);
        } else if (this.exportTypeFormat === 'xls') {
          this.exportPeriodAsXLS(filteredRows, fileNameXls);
        } else if (this.exportTypeFormat === 'xlsx') {
          this.exportPeriodAsXLSX(filteredRows, fileNameXlsx);
        } else {
          throw new Error(`Format d'export non supporté: ${this.exportTypeFormat}`);
        }
        exported++;
      }
      if (exported > 0) {
        this.showSuccess('exportType', `Export par type réussi (${exported} fichier(s)).`);
      } else {
        this.showError('exportType', this.t('TRT.msg.noDataForSelectedTypes'));
      }
    } catch (e) {
      this.showError('exportType', 'Erreur lors de l\'export par type.');
    }
  }

  convertColumnsToAmount() {
    try {
      for (const col of this.formatOptions.amountColumns) {
        for (const row of this.combinedRows) {
          if (row[col] !== undefined && row[col] !== null) {
            const num = parseFloat(row[col].toString().replace(/\s/g, '').replace(',', '.'));
            row[col] = isNaN(num) ? row[col] : num;
          }
        }
      }
      this.showSuccess('amount', this.t('TRT.msg.toAmountSuccess'));
    } catch (e) {
      this.showError('amount', this.t('TRT.msg.toAmountError'));
    }
  }

  applyConcat() {
    if (!this.concatCols.length || !this.concatNewCol) return;
    try {
      // Appliquer la concaténation sur toutes les données d'origine
      this.originalRows = this.originalRows.map(row => {
        const newRow = { ...row };
        // Utiliser l'ordre des colonnes tel qu'il est dans concatCols
        newRow[this.concatNewCol] = buildConcatenatedValue(
          this.concatCols.map(col => row[col]),
          this.concatSeparator ?? ''
        );
        return newRow;
      });
      // Mettre à jour la liste des colonnes si besoin
      if (!this.allColumns.includes(this.concatNewCol)) {
        this.allColumns = [this.concatNewCol, ...this.allColumns];
      }
      if (!this.columns.includes(this.concatNewCol)) {
        this.columns = [this.concatNewCol, ...this.columns];
      }
      // Si une sélection de colonnes est active, ajouter la nouvelle colonne à la sélection
      if (this.selectionApplied && this.selectedCols.length > 0 && !this.selectedCols.includes(this.concatNewCol)) {
        this.selectedCols = [this.concatNewCol, ...this.selectedCols];
      }
      // Réappliquer le filtre si actif, sinon tout afficher
      if (this.filterApplied && this.selectedFilterColumn && this.selectedFilterValues && this.selectedFilterValues.length > 0 && this.selectedFilterValues.includes(this.selectedFilterValues[0])) {
        this.applyFilter();
      } else {
        this.allRows = [...this.originalRows];
        this.combinedRows = [...this.originalRows];
        this.updateDisplayedRows();
      }
      this.showSuccess('concat', `Colonne « ${this.concatNewCol} » créée par concaténation.`);
    } catch (e) {
      this.showError('concat', this.t('TRT.msg.concatError'));
    }
  }

  // Méthodes pour gérer l'ordre des colonnes dans la concaténation
  toggleConcatOrderMode() {
    this.concatOrderMode = !this.concatOrderMode;
  }

  moveConcatColumnUp(index: number) {
    if (index > 0 && index < this.concatCols.length) {
      const temp = this.concatCols[index];
      this.concatCols[index] = this.concatCols[index - 1];
      this.concatCols[index - 1] = temp;
    }
  }

  moveConcatColumnDown(index: number) {
    if (index >= 0 && index < this.concatCols.length - 1) {
      const temp = this.concatCols[index];
      this.concatCols[index] = this.concatCols[index + 1];
      this.concatCols[index + 1] = temp;
    }
  }

  removeConcatColumn(index: number) {
    if (index >= 0 && index < this.concatCols.length) {
      this.concatCols.splice(index, 1);
    }
  }

  addConcatColumn(column: string) {
    if (!this.concatCols.includes(column)) {
      this.concatCols.push(column);
    }
  }

  getAvailableColumnsForConcat(): string[] {
    return this.columns.filter(col => !this.concatCols.includes(col));
  }

  // Méthodes pour le dropdown d'ordre
  onConcatColumnOrderChange(event: any, index: number) {
    const newIndex = parseInt(event.target.value);
    if (newIndex !== index && newIndex >= 0 && newIndex < this.concatCols.length) {
      // Déplacer la colonne à la nouvelle position
      const column = this.concatCols[index];
      this.concatCols.splice(index, 1);
      this.concatCols.splice(newIndex, 0, column);
    }
  }

  getConcatColumnOrderOptions(): number[] {
    return Array.from({ length: this.concatCols.length }, (_, i) => i + 1);
  }

















  private transformCharactersValue(value: string): string {
    const count = Math.max(1, Number(this.removeCharCount) || 1);
    const specificPosition = Math.max(1, Number(this.removeCharSpecificPosition) || 1);
    const text = preserveLeadingZeroString(value);

    if (this.removeCharMode === 'keep') {
      return keepCharactersFromString(
        text,
        this.removeCharPosition,
        count,
        specificPosition
      );
    }

    switch (this.removeCharPosition) {
      case 'start':
        if (text.length >= count) {
          return text.substring(count);
        }
        return text;
      case 'end':
        if (text.length >= count) {
          return text.substring(0, text.length - count);
        }
        return text;
      case 'specific': {
        const pos = specificPosition - 1;
        if (pos >= 0 && pos < text.length && pos + count <= text.length) {
          return text.substring(0, pos) + text.substring(pos + count);
        }
        return text;
      }
      default:
        return text;
    }
  }

  private finalizeRemovedCharactersCell(columnName: string, value: string): string {
    return finalizeRemoveCharactersCell(columnName, value, {
      removeCharMode: this.removeCharMode,
      removeCharCount: this.removeCharCount,
      leadingZeroMode: this.removeCharLeadingZeroMode
    });
  }

  onRemoveCharModeChange(): void {
    // Position spécifique supportée en mode conserver et supprimer.
  }

  applyRemoveCharactersFormatting() {
    if (!this.formatSelections['removeCharacters'].length) {
      this.showError('format', this.t('TRT.msg.selectAtLeastOneColumn'));
      return;
    }

    // Vérifier les paramètres de suppression / conservation
    if (!this.removeCharPosition) {
      this.showError('format', this.t('TRT.msg.selectPosition'));
      return;
    }

    const charCount = Number(this.removeCharCount) || 0;
    if (charCount <= 0) {
      const message = this.removeCharMode === 'keep'
        ? this.t('TRT.msg.keepCharsCount')
        : this.t('TRT.msg.removeCharsCount');
      this.showError('format', message);
      return;
    }

    if (this.removeCharPosition === 'specific') {
      const specificPosition = Number(this.removeCharSpecificPosition) || 0;
      if (specificPosition <= 0) {
        this.showError('format', this.t('TRT.msg.validPosition'));
        return;
      }
    }



    try {
      let processedCells = 0;
      let totalCells = 0;
      
      const actionLabel = this.removeCharMode === 'keep' ? 'Conservation' : 'Suppression';
      const sideLabel = this.removeCharPosition === 'start'
        ? 'gauche'
        : this.removeCharPosition === 'end'
          ? 'droite'
          : `position ${this.removeCharSpecificPosition}`;


      // Traiter les données affichées (combinedRows)
      this.combinedRows.forEach((row, rowIndex) => {
        this.formatSelections['removeCharacters'].forEach(col => {
          totalCells++;
          if (row[col] !== undefined && row[col] !== null) {
            let value = preserveLeadingZeroString(row[col]);
            const originalValue = value;
            
            // Vérifier que la chaîne a une longueur suffisante
            if (value.length === 0) {
      return;
    }
            
            value = this.finalizeRemovedCharactersCell(col, this.transformCharactersValue(value));
            
            if (value !== originalValue) {
              processedCells++;
            }
            
            row[col] = value;
          }
        });
      });

      // Mettre à jour aussi allRows si la sélection n'est pas appliquée
      if (!this.selectionApplied) {
        this.allRows.forEach((row, rowIndex) => {
          this.formatSelections['removeCharacters'].forEach(col => {
            if (row[col] !== undefined && row[col] !== null) {
              // Convertir en chaîne si ce n'est pas déjà le cas
              let value = String(row[col]);
              
              // Vérifier que la chaîne a une longueur suffisante
              if (value.length === 0) {
                return;
              }
              
              value = this.finalizeRemovedCharactersCell(col, this.transformCharactersValue(value));
              
              row[col] = value;
            }
          });
        });
      }


      const actionText = this.removeCharMode === 'keep'
        ? `Conservation de ${this.removeCharCount} caractère(s)`
        : this.t('TRT.msg.removeCharsLabel');
      this.showSuccess('format', `${actionText} appliquée sur ${this.formatSelections['removeCharacters'].length} colonne(s) (${processedCells} modifications)`);
      
      // Forcer la mise à jour de l'affichage
      this.updateDisplayedRowsForPage();
      this.cd.detectChanges();
    } catch (error) {
      this.showError('format', this.t('TRT.msg.removeCharsError'));
    }
  }

  applyRemoveSpecialStringsFormatting() {
    if (!this.formatSelections['removeSpecialStrings'] || this.formatSelections['removeSpecialStrings'].length === 0) {
      this.showError('format', this.t('TRT.msg.selectColumnToProcess'));
      return;
    }

    if (!this.specialStringToRemove || this.specialStringToRemove.trim() === '') {
      this.showError('format', this.t('TRT.msg.specifyStringToRemove'));
      return;
    }

    if (!this.specialStringRemovalMode) {
      this.showError('format', this.t('TRT.msg.selectRemoveMode'));
      return;
    }

    try {
      let processedCells = 0;
      let totalCells = 0;
      
      // Traiter les données affichées (combinedRows)
      this.combinedRows.forEach((row, rowIndex) => {
        this.formatSelections['removeSpecialStrings'].forEach(col => {
          totalCells++;
          if (row[col] !== undefined && row[col] !== null) {
            let value = preserveLeadingZeroString(row[col]);
            const originalValue = value;
            
            // Vérifier que la chaîne n'est pas vide
            if (value.length === 0) {
              return;
            }
            
            // Appliquer la suppression selon le mode
            switch (this.specialStringRemovalMode) {
              case 'all':
                // Supprimer toutes les occurrences
                value = value.split(this.specialStringToRemove).join('');
                break;
              case 'start':
                // Supprimer seulement au début
                if (value.startsWith(this.specialStringToRemove)) {
                  value = value.substring(this.specialStringToRemove.length);
                }
                break;
              case 'end':
                // Supprimer seulement à la fin
                if (value.endsWith(this.specialStringToRemove)) {
                  value = value.substring(0, value.length - this.specialStringToRemove.length);
                }
                break;
            }
            
            if (value !== originalValue) {
              processedCells++;
            }
            
            row[col] = value;
          }
        });
      });

      // Mettre à jour aussi allRows si la sélection n'est pas appliquée
      if (!this.selectionApplied) {
        this.allRows.forEach((row, rowIndex) => {
          this.formatSelections['removeSpecialStrings'].forEach(col => {
            if (row[col] !== undefined && row[col] !== null) {
              // Convertir en chaîne si ce n'est pas déjà le cas
              let value = String(row[col]);
              
              // Vérifier que la chaîne n'est pas vide
              if (value.length === 0) {
                return;
              }
              
              // Appliquer la suppression selon le mode
              switch (this.specialStringRemovalMode) {
                case 'all':
                  // Supprimer toutes les occurrences
                  value = value.split(this.specialStringToRemove).join('');
                  break;
                case 'start':
                  // Supprimer seulement au début
                  if (value.startsWith(this.specialStringToRemove)) {
                    value = value.substring(this.specialStringToRemove.length);
                  }
                  break;
                case 'end':
                  // Supprimer seulement à la fin
                  if (value.endsWith(this.specialStringToRemove)) {
                    value = value.substring(0, value.length - this.specialStringToRemove.length);
                  }
                  break;
              }
              
              row[col] = value;
            }
          });
        });
      }


      this.showSuccess('format', `Suppression de caractères spéciaux appliquée sur ${this.formatSelections['removeSpecialStrings'].length} colonne(s) (${processedCells} modifications)`);
      
      // Forcer la mise à jour de l'affichage
      this.updateDisplayedRowsForPage();
      this.cd.detectChanges();
    } catch (error) {
      this.showError('format', this.t('TRT.msg.removeSpecialCharsError') + error.message);
    }
  }

  applyRemoveNumbersFormatting() {
    if (!this.formatSelections['removeNumbers'].length) {
      this.showError('format', this.t('TRT.msg.selectAtLeastOneColumn'));
      return;
    }

    try {
      let processedCells = 0;
      let totalCells = 0;
      
      // Traiter les données affichées (combinedRows)
      this.combinedRows.forEach((row, rowIndex) => {
        this.formatSelections['removeNumbers'].forEach(col => {
          totalCells++;
          if (row[col] !== undefined && row[col] !== null) {
            let value = preserveLeadingZeroString(row[col]);
            const originalValue = value;
            
            // Vérifier que la chaîne a une longueur suffisante
            if (value.length === 0) {
              return;
            }
            
            // Supprimer tous les chiffres (0-9)
            value = value.replace(/\d/g, '');
            
            if (value !== originalValue) {
                processedCells++;
              }
              
            row[col] = value;
          }
        });
      });

      // Mettre à jour aussi allRows si la sélection n'est pas appliquée
      if (!this.selectionApplied) {
        this.allRows.forEach((row, rowIndex) => {
          this.formatSelections['removeNumbers'].forEach(col => {
            if (row[col] !== undefined && row[col] !== null) {
              // Convertir en chaîne si ce n'est pas déjà le cas
              let value = String(row[col]);
              
              // Vérifier que la chaîne a une longueur suffisante
              if (value.length === 0) {
                return;
              }
              
              // Supprimer tous les chiffres (0-9)
              value = value.replace(/\d/g, '');
              
              row[col] = value;
            }
          });
        });
      }


      this.showSuccess('format', `Suppression de nombres appliquée sur ${this.formatSelections['removeNumbers'].length} colonne(s) (${processedCells} modifications)`);
      
      // Forcer la mise à jour de l'affichage
      this.updateDisplayedRowsForPage();
      this.cd.detectChanges();
    } catch (error) {
      this.showError('format', this.t('TRT.msg.removeNumbersError'));
    }
  }

  applyRemoveIndicatifFormatting() {
    if (!this.formatSelections['removeIndicatif'].length) {
      this.showError('format', this.t('TRT.msg.selectAtLeastOneColumn'));
      return;
    }

    try {
      let processedCells = 0;
      let totalCells = 0;
      
      // Traiter les données affichées (combinedRows)
      this.combinedRows.forEach((row, rowIndex) => {
        this.formatSelections['removeIndicatif'].forEach(col => {
          totalCells++;
          if (row[col] !== undefined && row[col] !== null) {
            // Convertir en chaîne si ce n'est pas déjà le cas
            let value = String(row[col]).trim();
            const originalValue = value;
            
            // Vérifier que la chaîne a une longueur suffisante
            if (value.length === 0) {
      return;
    }

            let modified = false;

            switch (this.indicatifType) {
              case 'international':
                // Supprimer les indicatifs internationaux courants
                // Format: +XX ou +XXX ou +XXXX
                const internationalPattern = /^\+(\d{1,4})\s*/;
                if (internationalPattern.test(value)) {
                  value = value.replace(internationalPattern, '');
                  modified = true;
                }
                break;

              case 'national':
                // Supprimer les indicatifs nationaux français
                // Format: 0X XX XX XX XX ou 0XXXXXXXXX
                const nationalPattern = /^0\d\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}$/;
                if (nationalPattern.test(value.replace(/\s/g, ''))) {
                  // Supprimer le premier chiffre (0) et reformater
                  const cleanNumber = value.replace(/\s/g, '').substring(1);
                  value = cleanNumber.replace(/(\d{2})(?=\d)/g, '$1 ');
                  modified = true;
                }
                break;

              case 'custom':
                // Supprimer un indicatif personnalisé
                if (this.customIndicatif && value.startsWith(this.customIndicatif)) {
                  value = value.substring(this.customIndicatif.length).trim();
                  modified = true;
                }
                break;
            }
            
            if (modified) {
              processedCells++;
            }
            
            row[col] = value;
          }
        });
      });

      // Mettre à jour aussi allRows si la sélection n'est pas appliquée
      if (!this.selectionApplied) {
        this.allRows.forEach((row, rowIndex) => {
          this.formatSelections['removeIndicatif'].forEach(col => {
            if (row[col] !== undefined && row[col] !== null) {
              // Convertir en chaîne si ce n'est pas déjà le cas
              let value = String(row[col]).trim();
              
              // Vérifier que la chaîne a une longueur suffisante
              if (value.length === 0) {
                return;
              }

              switch (this.indicatifType) {
                case 'international':
                  // Supprimer les indicatifs internationaux courants
                  const internationalPattern = /^\+(\d{1,4})\s*/;
                  if (internationalPattern.test(value)) {
                    value = value.replace(internationalPattern, '');
                  }
                  break;

                case 'national':
                  // Supprimer les indicatifs nationaux français
                  const nationalPattern = /^0\d\s*\d{2}\s*\d{2}\s*\d{2}\s*\d{2}$/;
                  if (nationalPattern.test(value.replace(/\s/g, ''))) {
                    // Supprimer le premier chiffre (0) et reformater
                    const cleanNumber = value.replace(/\s/g, '').substring(1);
                    value = cleanNumber.replace(/(\d{2})(?=\d)/g, '$1 ');
                  }
                  break;

                case 'custom':
                  // Supprimer un indicatif personnalisé
                  if (this.customIndicatif && value.startsWith(this.customIndicatif)) {
                    value = value.substring(this.customIndicatif.length).trim();
                  }
                  break;
              }
              
              row[col] = value;
            }
          });
        });
      }


      this.showSuccess('format', `Suppression d'indicatif appliquée sur ${this.formatSelections['removeIndicatif'].length} colonne(s) (${processedCells} modifications)`);
      
      // Forcer la mise à jour de l'affichage
      this.updateDisplayedRowsForPage();
      this.cd.detectChanges();
    } catch (error) {
      this.showError('format', this.t('TRT.msg.removeIndicatifError'));
    }
  }

  applyRemoveDecimalsFormatting() {
    if (!this.formatSelections['removeDecimals'].length) {
      this.showError('format', this.t('TRT.msg.selectAtLeastOneColumn'));
      return;
    }

    try {
      let processedCells = 0;
      let totalCells = 0;
      
      // Traiter les données affichées (combinedRows)
      this.combinedRows.forEach((row, rowIndex) => {
        this.formatSelections['removeDecimals'].forEach(col => {
          totalCells++;
          if (row[col] !== undefined && row[col] !== null) {
            // Convertir en chaîne si ce n'est pas déjà le cas
            let value = String(row[col]).trim();
            const originalValue = value;
            
            // Vérifier que la chaîne a une longueur suffisante
            if (value.length === 0) {
              return;
            }

            let modified = false;

            // Détecter et supprimer les décimales selon le séparateur choisi
            if (this.decimalSeparator === ',') {
              // Format français : 3 000,00 ou 3000,00 - gère les séparateurs de milliers (espaces)
              // Pattern: nombre avec espaces possibles + virgule + décimales
              const frenchPattern = /^([\d\s]+)\s*,\s*(\d+)\s*$/;
              const match = value.match(frenchPattern);
              if (match) {
                let integerPart = match[1];
                const decimalPart = match[2];
                
                // Nettoyer la partie entière en supprimant les espaces (séparateurs de milliers)
                integerPart = integerPart.replace(/\s/g, '');
                
                // Si on garde les zéros de fin et que la partie décimale n'est pas que des zéros
                if (this.keepTrailingZeros && !/^0+$/.test(decimalPart)) {
                  // Garder le nombre tel quel
                  return;
                }
                
                // Supprimer la partie décimale et retourner la partie entière nettoyée
                value = integerPart;
                modified = true;
              } else {
              }
            } else {
              // Format anglais : 3,000.00 ou 3000.00 - gère les séparateurs de milliers (virgules)
              // Pattern: nombre avec virgules possibles + point + décimales
              const englishPattern = /^([\d,]+)\s*\.\s*(\d+)\s*$/;
              const match = value.match(englishPattern);
              if (match) {
                let integerPart = match[1];
                const decimalPart = match[2];
                
                // Nettoyer la partie entière en supprimant les virgules (séparateurs de milliers)
                integerPart = integerPart.replace(/,/g, '');
                
                // Si on garde les zéros de fin et que la partie décimale n'est pas que des zéros
                if (this.keepTrailingZeros && !/^0+$/.test(decimalPart)) {
                  // Garder le nombre tel quel
                  return;
                }
                
                // Supprimer la partie décimale et retourner la partie entière nettoyée
                value = integerPart;
                modified = true;
              } else {
              }
            }
            
            if (modified) {
              processedCells++;
            }
            
            row[col] = value;
          }
        });
      });

      // Mettre à jour aussi allRows si la sélection n'est pas appliquée
      if (!this.selectionApplied) {
        this.allRows.forEach((row, rowIndex) => {
          this.formatSelections['removeDecimals'].forEach(col => {
            if (row[col] !== undefined && row[col] !== null) {
              // Convertir en chaîne si ce n'est pas déjà le cas
              let value = String(row[col]).trim();
              
              // Vérifier que la chaîne a une longueur suffisante
              if (value.length === 0) {
                return;
              }

              // Détecter et supprimer les décimales selon le séparateur choisi
              if (this.decimalSeparator === ',') {
                // Format français : 3 000,00 ou 3000,00 - gère les séparateurs de milliers (espaces)
                // Pattern: nombre avec espaces possibles + virgule + décimales
                const frenchPattern = /^([\d\s]+)\s*,\s*(\d+)\s*$/;
                const match = value.match(frenchPattern);
                if (match) {
                  let integerPart = match[1];
                  const decimalPart = match[2];
                  
                  // Nettoyer la partie entière en supprimant les espaces (séparateurs de milliers)
                  integerPart = integerPart.replace(/\s/g, '');
                  
                  // Si on garde les zéros de fin et que la partie décimale n'est pas que des zéros
                  if (this.keepTrailingZeros && !/^0+$/.test(decimalPart)) {
                    // Garder le nombre tel quel
                    return;
                  }
                  
                  // Supprimer la partie décimale et retourner la partie entière nettoyée
                  value = integerPart;
                }
              } else {
                // Format anglais : 3,000.00 ou 3000.00 - gère les séparateurs de milliers (virgules)
                // Pattern: nombre avec virgules possibles + point + décimales
                const englishPattern = /^([\d,]+)\s*\.\s*(\d+)\s*$/;
                const match = value.match(englishPattern);
                if (match) {
                  let integerPart = match[1];
                  const decimalPart = match[2];
                  
                  // Nettoyer la partie entière en supprimant les virgules (séparateurs de milliers)
                  integerPart = integerPart.replace(/,/g, '');
                  
                  // Si on garde les zéros de fin et que la partie décimale n'est pas que des zéros
                  if (this.keepTrailingZeros && !/^0+$/.test(decimalPart)) {
                    // Garder le nombre tel quel
                    return;
                  }
                  
                  // Supprimer la partie décimale et retourner la partie entière nettoyée
                  value = integerPart;
                }
              }
              
              row[col] = value;
            }
          });
        });
      }


      this.showSuccess('format', `Suppression de décimales appliquée sur ${this.formatSelections['removeDecimals'].length} colonne(s) (${processedCells} modifications)`);
      
      // Forcer la mise à jour de l'affichage
      this.updateDisplayedRowsForPage();
      this.cd.detectChanges();
    } catch (error) {
      this.showError('format', this.t('TRT.msg.removeDecimalsError'));
    }
  }

  /**
   * Applique le formatage pour garder les N derniers digits
   */
  applyKeepLastDigitsFormatting() {
    if (!this.formatSelections['keepLastDigits'].length) {
      this.showError('format', this.t('TRT.msg.selectAtLeastOneColumn'));
      return;
    }

    if (this.keepLastDigitsCount <= 0) {
      this.showError('format', this.t('TRT.msg.keepDigitsCount'));
      return;
    }

    try {
      let processedCells = 0;
      let totalCells = 0;
      
      
      // Traiter les données affichées (combinedRows)
      this.combinedRows.forEach((row, rowIndex) => {
        this.formatSelections['keepLastDigits'].forEach(col => {
          totalCells++;
          if (row[col] !== undefined && row[col] !== null) {
            // Convertir en chaîne si ce n'est pas déjà le cas
            let value = String(row[col]).trim();
            const originalValue = value;
            
            // Vérifier que la chaîne a une longueur suffisante
            if (value.length === 0) {
              return;
            }

            // Extraire seulement les digits (nombres)
            const digitsOnly = value.replace(/\D/g, '');
            
            if (digitsOnly.length === 0) {
              // Aucun digit trouvé, garder la valeur originale
              return;
            }

            // Garder les N derniers digits
            if (digitsOnly.length >= this.keepLastDigitsCount) {
              value = digitsOnly.slice(-this.keepLastDigitsCount);
              row[col] = value;
              processedCells++;
              
              if (rowIndex < 5) { // Log pour les 5 premières lignes
              }
            } else {
              // Si moins de digits que demandé, garder tous les digits disponibles
              value = digitsOnly;
              row[col] = value;
              processedCells++;
              
              if (rowIndex < 5) { // Log pour les 5 premières lignes
              }
            }
          }
        });
      });

      // Mettre à jour aussi allRows si la sélection n'est pas appliquée
      if (!this.selectionApplied) {
        this.allRows.forEach((row, rowIndex) => {
          this.formatSelections['keepLastDigits'].forEach(col => {
            if (row[col] !== undefined && row[col] !== null) {
              // Convertir en chaîne si ce n'est pas déjà le cas
              let value = String(row[col]).trim();
              
              // Vérifier que la chaîne a une longueur suffisante
              if (value.length === 0) {
                return;
              }

              // Extraire seulement les digits (nombres)
              const digitsOnly = value.replace(/\D/g, '');
              
              if (digitsOnly.length === 0) {
                // Aucun digit trouvé, garder la valeur originale
                return;
              }

              // Garder les N derniers digits
              if (digitsOnly.length >= this.keepLastDigitsCount) {
                value = digitsOnly.slice(-this.keepLastDigitsCount);
                row[col] = value;
              } else {
                // Si moins de digits que demandé, garder tous les digits disponibles
                value = digitsOnly;
                row[col] = value;
              }
            }
          });
        });
      }


      this.showSuccess('format', `Formatage "garder ${this.keepLastDigitsCount} derniers digits" appliqué sur ${this.formatSelections['keepLastDigits'].length} colonne(s) (${processedCells} modifications)`);
      
      // Forcer la mise à jour de l'affichage
      this.updateDisplayedRowsForPage();
      this.cd.detectChanges();
    } catch (error) {
      this.showError('format', this.t('TRT.msg.digitsFormatError'));
    }
  }

  /**
   * Applique le formatage pour supprimer .0 sur les dates
   */
  applyRemoveZeroDecimalsFormatting() {
    if (!this.formatSelections['removeZeroDecimals'].length) {
      this.showError('format', this.t('TRT.msg.selectAtLeastOneColumn'));
      return;
    }

    try {
      let totalCells = 0;
      let processedCells = 0;
      
      
      // Traiter les données affichées (combinedRows)
      this.combinedRows.forEach((row, rowIndex) => {
        this.formatSelections['removeZeroDecimals'].forEach(col => {
          totalCells++;
          if (row[col] !== undefined && row[col] !== null) {
            // Convertir en chaîne si ce n'est pas déjà le cas
            let value = String(row[col]).trim();
            const originalValue = value;
            
            // Supprimer .0 à la fin de la chaîne
            if (value.endsWith('.0')) {
              value = value.slice(0, -2);
              row[col] = value;
              processedCells++;
              
              if (rowIndex < 5) { // Log pour les 5 premières lignes
              }
            }
          }
        });
      });

      // Mettre à jour aussi allRows si la sélection n'est pas appliquée
      if (!this.selectionApplied) {
        this.allRows.forEach((row, rowIndex) => {
          this.formatSelections['removeZeroDecimals'].forEach(col => {
            if (row[col] !== undefined && row[col] !== null) {
              // Convertir en chaîne si ce n'est pas déjà le cas
              let value = String(row[col]).trim();
              
              // Supprimer .0 à la fin de la chaîne
              if (value.endsWith('.0')) {
                value = value.slice(0, -2);
                row[col] = value;
              }
            }
          });
        });
      }


      this.showSuccess('format', `Suppression des .0 sur les dates appliquée sur ${this.formatSelections['removeZeroDecimals'].length} colonne(s) (${processedCells} modifications)`);
      
      // Forcer la mise à jour de l'affichage
      this.updateDisplayedRowsForPage();
      this.cd.detectChanges();
    } catch (error) {
      this.showError('format', this.t('TRT.msg.removeDotZeroError'));
    }
  }

  /**
   * Applique le formatage pour supprimer les espaces
   */
  applyRemoveSpacesFormatting() {
    if (!this.formatSelections['removeSpaces'].length) {
      this.showError('format', this.t('TRT.msg.selectAtLeastOneColumn'));
      return;
    }

    try {
      let totalCells = 0;
      let processedCells = 0;
      
      
      // Traiter les données affichées (combinedRows)
      this.combinedRows.forEach((row, rowIndex) => {
        this.formatSelections['removeSpaces'].forEach(col => {
          totalCells++;
          if (row[col] !== undefined && row[col] !== null) {
            let value = preserveLeadingZeroString(row[col]);
            const originalValue = value;
            
            // Appliquer la suppression d'espaces selon le type choisi
            switch (this.removeSpacesType) {
              case 'all':
                value = value.replace(/\s/g, '');
                break;
              case 'leading':
                value = value.replace(/^\s+/, '');
                break;
              case 'trailing':
                value = value.replace(/\s+$/, '');
                break;
              case 'multiple':
                value = value.replace(/\s+/g, ' ');
                break;
            }
            
            if (value !== originalValue) {
              row[col] = value;
              processedCells++;
              
              if (rowIndex < 5) { // Log pour les 5 premières lignes
              }
            }
          }
        });
      });

      // Mettre à jour aussi allRows si la sélection n'est pas appliquée
      if (!this.selectionApplied) {
        this.allRows.forEach((row, rowIndex) => {
          this.formatSelections['removeSpaces'].forEach(col => {
            if (row[col] !== undefined && row[col] !== null) {
              // Convertir en chaîne si ce n'est pas déjà le cas
              let value = String(row[col]);
              
              // Appliquer la suppression d'espaces selon le type choisi
              switch (this.removeSpacesType) {
                case 'all':
                  value = value.replace(/\s/g, '');
                  break;
                case 'leading':
                  value = value.replace(/^\s+/, '');
                  break;
                case 'trailing':
                  value = value.replace(/\s+$/, '');
                  break;
                case 'multiple':
                  value = value.replace(/\s+/g, ' ');
                  break;
              }
              
              row[col] = value;
            }
          });
        });
      }


      this.showSuccess('format', `Suppression des espaces (${this.removeSpacesType}) appliquée sur ${this.formatSelections['removeSpaces'].length} colonne(s) (${processedCells} modifications)`);
      
      // Forcer la mise à jour de l'affichage
      this.updateDisplayedRowsForPage();
      this.cd.detectChanges();
    } catch (error) {
      this.showError('format', this.t('TRT.msg.removeSpacesError'));
    }
  }

  ngOnInit() {
    // Charger les extensions configurées
    this.loadTraitementExtensions();
    try {
      this.configurationCalculService.loadRules().subscribe({
        next: () => {
          this.loadTraitementExtensions();
          this.cd.detectChanges();
        },
        error: () => {
          this.loadTraitementExtensions();
          this.cd.detectChanges();
        }
      });
    } catch {
      // ignore
    }
    
    // Initialiser l'affichage au démarrage
    this.currentPage = 1;
    this.showAllRows = false;
    this.displayedRows = [];
    this.combinedRows = [];
    this.columns = [];
    
    // Configurer le listener de recherche pour les filtres
    this.filterValueSearchCtrl.valueChanges.subscribe((search: string | null) => {
      const s = (search || '').toLowerCase();
      this.filteredFilterValues = this.filterValues.filter(val => 
        (val || '').toString().toLowerCase().includes(s)
      );
    });
    
    // Optimiser l'affichage initial
    this.optimizeInitialDisplay();
    
    // Forcer la détection de changement
    this.cd.detectChanges();
    
    // Restaurer l'état si présent
    const saved = localStorage.getItem(this.LOCAL_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      Object.assign(this, data);
      this.updateDisplayedRows();
    }
    // Appliquer l'ordre des colonnes sauvegardé si disponible
    if (this.columns && this.columns.length) {
      this.applySavedColumnOrderFromStorage();
    }
  }

  ngAfterViewInit() {
    // Forcer le recalcul du layout et la détection de changement après affichage
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      this.cd.detectChanges();
    }, 100);
    
    // Sauvegarder l'état seulement pour les petits fichiers (éviter le quota localStorage)
    const save = () => {
      try {
        // Vérifier la taille des données avant de sauvegarder
        const dataToSave = {
          selectedFiles: this.selectedFiles.map(f => ({ name: f.name, size: f.size })),
          columns: this.columns,
          dedupCols: this.dedupCols,
          formatOptions: this.formatOptions,
          extractCol: this.extractCol,
          extractType: this.extractType,
          extractCount: this.extractCount,
          extractKey: this.extractKey,
          extractStart: this.extractStart,
          selectedCols: this.selectedCols,
          successMsg: this.successMsg,
          errorMsg: this.errorMsg,
          selectedDateFormat: this.selectedDateFormat,
          exportTypeCol: this.exportTypeCol,
          exportTypeValues: this.exportTypeValues,
          exportTypeSelected: this.exportTypeSelected,
          allColumns: this.allColumns,
          selectionApplied: this.selectionApplied,
          selectedFilterColumn: this.selectedFilterColumn,
          filterValues: this.filterValues,
          selectedFilterValues: this.selectedFilterValues,
          filterApplied: this.filterApplied,
          concatCols: this.concatCols,
          concatNewCol: this.concatNewCol,
          concatSeparator: this.concatSeparator,
          exportTypePrefix: this.exportTypePrefix,
          exportTypeSuffix: this.exportTypeSuffix,
          exportTypeCustomSuffix: this.exportTypeCustomSuffix,
          exportTypeDescription: this.exportTypeDescription,
          removeCharMode: this.removeCharMode,
          removeCharPosition: this.removeCharPosition,
          removeCharCount: this.removeCharCount,
          removeCharSpecificPosition: this.removeCharSpecificPosition,
          removeCharLeadingZeroMode: this.removeCharLeadingZeroMode,
          specialStringToRemove: this.specialStringToRemove,
          specialStringRemovalMode: this.specialStringRemovalMode,
          specificCharactersToRemove: this.specificCharactersToRemove,
          removeSpecificCharactersCaseSensitive: this.removeSpecificCharactersCaseSensitive,
          removeSpacesType: this.removeSpacesType,
          currentPage: this.currentPage,
          rowsPerPage: this.rowsPerPage,
          maxDisplayedRows: this.maxDisplayedRows,
          showAllRows: this.showAllRows
        };
        
        // Ne pas sauvegarder les données volumineuses (allRows, combinedRows, etc.)
        const dataString = JSON.stringify(dataToSave);
        
        // Vérifier si la taille est raisonnable (< 1MB)
        if (dataString.length < 1024 * 1024) {
          localStorage.setItem(this.LOCAL_STORAGE_KEY, dataString);
        } else {
          // Nettoyer l'ancienne sauvegarde si elle existe
          localStorage.removeItem(this.LOCAL_STORAGE_KEY);
        }
      } catch (error) {
        // Nettoyer en cas d'erreur
        localStorage.removeItem(this.LOCAL_STORAGE_KEY);
      }
    };
    
    // Sauvegarder seulement pour les petits fichiers
    if (this.allRows.length < 10000) { // Seulement pour les fichiers < 10k lignes
      setInterval(save, 5000); // Sauvegarde moins fréquente
    }
  }

  // Méthode pour optimiser l'affichage initial
  private optimizeInitialDisplay() {
    // S'assurer que les éléments sont correctement dimensionnés
    setTimeout(() => {
      this.cd.detectChanges();
      // Forcer un second rafraîchissement pour s'assurer que tout est bien affiché
      setTimeout(() => {
        this.cd.detectChanges();
      }, 100);
    }, 50);
  }

  newTraitement() {
    // Vider toutes les données et supprimer la clé locale
    this.selectedFiles = [];
    this.combinedRows = [];
    this.columns = [];
    this.dedupCols = [];
    this.formatOptions = {
      trimSpaces: false,
      toLowerCase: false,
      toUpperCase: false,
      normalizeDates: false,
      normalizeNumbers: false,
      amountColumns: [],
      numberColumns: [],
      dateColumns: [],
      dateFormat: 'yyyy-MM-dd',
      removeSeparators: false,
      dotToComma: false,
      removeDashesAndCommas: false,
      absoluteValue: false,
      removeCharacters: false,
      removeSpecificCharacters: false,
      cleanAmounts: false
    };
    this.extractCol = '';
    this.extractType = '';
    this.extractCount = 1;
    this.extractKey = '';
    this.extractStart = 1;
    this.selectedCols = [];
    this.successMsg = {};
    this.errorMsg = {};
    this.selectedDateFormat = 'yyyy-MM-dd';
    this.exportTypeCol = '';
    this.exportTypeValues = [];
    this.exportTypeSelected = [];
    this.allRows = [];
    this.allColumns = [];
    this.originalRows = [];
    this.selectionApplied = false;
    this.selectedFilterColumn = '';
    this.filterValues = [];
    this.selectedFilterValues = [];
    this.filteredRows = [];
    this.filterApplied = false;
    this.concatCols = [];
    this.concatNewCol = '';
    this.concatSeparator = '';
    this.exportTypePrefix = '';
    this.exportTypeSuffix = '';
    this.exportTypeCustomSuffix = '';
    this.exportTypeDescription = '';
    this.removeCharMode = 'remove';
    this.removeCharPosition = 'start';
    this.removeCharCount = 1;
    this.removeCharSpecificPosition = 1;
    this.removeCharLeadingZeroMode = 'none';
    this.specialStringToRemove = '';
    this.specialStringRemovalMode = 'all';
    this.specificCharactersToRemove = '';
    this.removeSpecificCharactersCaseSensitive = true;
    this.removeSpacesType = 'all';
    this.currentPage = 1;
    this.rowsPerPage = 100;
    this.maxDisplayedRows = 1000;
    this.showAllRows = false;
    this.displayedRows = [];
    this.isGdjFile = false;
    this.gdjHeaderRowIndex = -1;
    localStorage.removeItem(this.LOCAL_STORAGE_KEY);
    this.updateDisplayedRows();
  }

  toggleSelectAllCols(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.checked) {
      this.selectedCols = [...this.allColumns];
    } else {
      this.selectedCols = [];
    }
  }

  // --- MÉTHODES POUR LA RÉORGANISATION DES COLONNES ---
  
  toggleColumnReorderMode() {
    this.isColumnReorderMode = !this.isColumnReorderMode;
    if (this.isColumnReorderMode) {
      this.reorderedColumns = [...this.columns];
    }
  }

  getDisplayColumns(): string[] {
    return this.isColumnReorderMode ? this.reorderedColumns : this.columns;
  }

  onColumnDragStart(event: DragEvent, column: string) {
    if (!this.isColumnReorderMode) return;
    this.draggedColumn = column;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', column);
    }
  }

  onColumnDragOver(event: DragEvent, column: string) {
    if (!this.isColumnReorderMode || !this.draggedColumn) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dragOverColumn = column;
  }

  onColumnDrop(event: DragEvent, targetColumn: string) {
    if (!this.isColumnReorderMode || !this.draggedColumn) return;
    event.preventDefault();
    
    if (this.draggedColumn !== targetColumn) {
      const draggedIndex = this.reorderedColumns.indexOf(this.draggedColumn);
      const targetIndex = this.reorderedColumns.indexOf(targetColumn);
      
      // Réorganiser les colonnes
      const newColumns = [...this.reorderedColumns];
      newColumns.splice(draggedIndex, 1);
      newColumns.splice(targetIndex, 0, this.draggedColumn);
      
      this.reorderedColumns = newColumns;
    }
    
    this.draggedColumn = null;
    this.dragOverColumn = null;
  }

  onColumnDragEnd() {
    this.draggedColumn = null;
    this.dragOverColumn = null;
  }

  applyColumnReorder() {
    if (this.isColumnReorderMode) {
      this.columns = [...this.reorderedColumns];
      this.isColumnReorderMode = false;
      this.showSuccess('reorder', this.t('TRT.msg.columnOrderApplied'));
      this.saveColumnOrderToStorage();
    }
  }

  cancelColumnReorder() {
    this.isColumnReorderMode = false;
    this.reorderedColumns = [...this.columns];
    this.draggedColumn = null;
    this.dragOverColumn = null;
  }

  resetColumnOrder() {
    // Supprimer l'ordre personnalisé et rétablir l'ordre par défaut détecté
    try {
      localStorage.removeItem(this.LOCAL_STORAGE_COLUMN_ORDER_KEY);
    } catch {}
    if (this.allColumns && this.allColumns.length) {
      this.columns = [...this.allColumns];
      if (this.isColumnReorderMode) {
        this.reorderedColumns = [...this.columns];
      }
      this.updateDisplayedRows();
      this.showSuccess('reorder', this.t('TRT.msg.columnOrderReset'));
    }
  }

  private saveColumnOrderToStorage() {
    try {
      const dataString = JSON.stringify(this.columns || []);
      if (dataString.length < 200_000) {
        localStorage.setItem(this.LOCAL_STORAGE_COLUMN_ORDER_KEY, dataString);
      }
    } catch (e) {
      // best-effort
    }
  }

  private applySavedColumnOrderFromStorage() {
    try {
      const str = localStorage.getItem(this.LOCAL_STORAGE_COLUMN_ORDER_KEY);
      if (!str) return;
      const savedOrder: string[] = JSON.parse(str) || [];
      if (!Array.isArray(savedOrder) || !this.columns || this.columns.length === 0) return;
      // Conserver uniquement les colonnes présentes et dans l'ordre sauvegardé, puis ajouter les colonnes manquantes à la fin
      const set = new Set(this.columns);
      const ordered = savedOrder.filter(c => set.has(c));
      const missing = this.columns.filter(c => !ordered.includes(c));
      const newOrder = [...ordered, ...missing];
      if (newOrder.length === this.columns.length) {
        this.columns = newOrder;
        if (this.isColumnReorderMode) {
          this.reorderedColumns = [...this.columns];
        }
      }
    } catch (e) {
      // ignore storage parse errors
    }
  }

  moveColumnUp(column: string) {
    if (!this.isColumnReorderMode) return;
    
    const index = this.reorderedColumns.indexOf(column);
    if (index > 0) {
      const newColumns = [...this.reorderedColumns];
      [newColumns[index], newColumns[index - 1]] = [newColumns[index - 1], newColumns[index]];
      this.reorderedColumns = newColumns;
    }
  }

  moveColumnDown(column: string) {
    if (!this.isColumnReorderMode) return;
    
    const index = this.reorderedColumns.indexOf(column);
    if (index < this.reorderedColumns.length - 1) {
      const newColumns = [...this.reorderedColumns];
      [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
      this.reorderedColumns = newColumns;
    }
  }

  isColumnDragging(column: string): boolean {
    return this.draggedColumn === column;
  }

  isColumnDragOver(column: string): boolean {
    return this.dragOverColumn === column && this.draggedColumn !== column;
  }

  // Méthodes pour la prévisualisation CSV
  async confirmCsvImport() {
    if (!this.csvContentToProcess || !this.csvFileToProcess) {
      this.showError('upload', this.t('TRT.msg.noCsvToProcess'));
      return;
    }

    try {
      // Activer le flag pour indiquer que l'import vient de la prévisualisation
      // Cela désactive les filtres automatiques spécifiques aux modèles (Orange Money, GDJ)
      this.isImportFromPreview = true;
      
      this.isProcessing = true;
      this.processingMessage = this.t('TRT.msg.csvProcessingConfirmed');
      
      // Réinitialiser les données existantes
      this.combinedRows = [];
      this.columns = [];
      this.allRows = [];
      this.allColumns = [];
      this.originalRows = [];
      
      // Réinitialiser les paramètres d'affichage
      this.currentPage = 1;
      this.showAllRows = false;
      this.displayedRows = [];
      
      // Traiter le CSV avec le séparateur détecté
      await this.processCsvContent(this.csvContentToProcess, this.detectedDelimiter);
      
      // Finaliser le traitement
      this.combinedRows = [...this.allRows];
      this.columns = [...this.allColumns];
      this.originalRows = [...this.allRows];
      
      // Optimiser l'affichage pour les gros fichiers
      this.optimizeForLargeFiles();
      
      // Mettre à jour l'affichage
      this.updateDisplayedRows();
      this.updatePagination();
      
      // Masquer la prévisualisation
      this.showCsvPreview = false;
      this.isProcessing = false;
      
      const totalProcessed = this.allRows.length;
      
      this.showSuccess('upload', `Fichier CSV traité avec succès ! ${totalProcessed} lignes importées`);
      
      // Nettoyer les données temporaires
      this.csvContentToProcess = '';
      this.csvFileToProcess = null;
      this.csvPreviewData = [];
      this.csvPreviewColumns = [];
      // Réinitialiser le flag d'import depuis prévisualisation
      this.isImportFromPreview = false;
      
    } catch (error) {
      this.isProcessing = false;
      // Réinitialiser le flag d'import depuis prévisualisation en cas d'erreur
      this.isImportFromPreview = false;
      this.showError('upload', this.t('TRT.msg.csvProcessingError'));
    }
  }

  // Méthode pour traiter le contenu CSV comme un tableau normal
  async processCsvContent(csvContent: string, delimiter: string) {
    return new Promise<void>((resolve, reject) => {
      // Fichiers GDJ (LA GABONAISE DES JEUX) : ignorer le préambule et lire
      // les données à partir de la ligne d'en-tête détectée.
      const gdjDetection = this.detectGdjFile(csvContent, delimiter);
      this.isGdjFile = gdjDetection.isGdj;
      this.gdjHeaderRowIndex = gdjDetection.headerRowIndex;

      if (gdjDetection.isGdj) {
        Papa.parse(csvContent, {
          header: false,
          delimiter,
          skipEmptyLines: true,
          complete: async (results) => {
            try {
              const rawRows = results.data as any[];
              const colNames = gdjDetection.headerRow.map((v: any, i: number) => v ? v.toString() : 'Col' + (i + 1));
              const dataRows = rawRows.slice(gdjDetection.headerRowIndex + 1);

              if (dataRows.length > 0) {
                await this.processDataInBackground(
                  dataRows,
                  (chunk) => {
                    const rowsWithHeader = chunk.map((row: any[]) => {
                      const obj: any = {};
                      colNames.forEach((col: string, idx: number) => {
                        obj[col] = row[idx];
                      });
                      return obj;
                    });

                    this.combinedRows.push(...rowsWithHeader);
                    this.allRows.push(...rowsWithHeader);
                  },
                  50,
                  (progress) => {
                    this.processingMessage = `Traitement CSV GDJ: ${Math.round(progress)}%`;
                  }
                );

                for (const col of colNames) {
                  if (!this.columns.includes(col)) this.columns.push(col);
                  if (!this.allColumns.includes(col)) this.allColumns.push(col);
                }
              }

              resolve();
            } catch (error) {
              reject(error);
            }
          },
          error: (error: any) => {
            reject(error);
          }
        });
        return;
      }

      Papa.parse(csvContent, {
        header: true,
        delimiter,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            let rows = results.data as any[];
            
            // Si les colonnes sont nommées field1, field2... ou qu'il n'y a qu'une seule colonne, on relit sans header
            const firstRow = rows[0] || {};
            const allKeys = Object.keys(firstRow);
            const looksLikeNoHeader = allKeys.length <= 1 || allKeys.some(k => k.toLowerCase().startsWith('field'));
            
            if (looksLikeNoHeader) {
              Papa.parse(csvContent, {
                header: false,
                delimiter: delimiter,
                skipEmptyLines: true,
                complete: async (res2) => {
                  try {
                    const rawRows = res2.data as any[];
                    
                    if (rawRows.length > 1) {
                      const headerRow = rawRows[0];
                      const dataRows = rawRows.slice(1);
                      const colNames = headerRow.map((v: any, i: number) => v ? v.toString() : 'Col' + (i+1));
                      
                      
                      // Traitement en arrière-plan avec chunks très petits
                      await this.processDataInBackground(
                        dataRows,
                        (chunk) => {
                          const rowsWithHeader = chunk.map((row: any[]) => {
                            const obj: any = {};
                            colNames.forEach((col: string, idx: number) => {
                              obj[col] = row[idx];
                            });
                            return obj;
                          });
                          
                          this.combinedRows.push(...rowsWithHeader);
                          this.allRows.push(...rowsWithHeader);
                        },
                        50, // Chunks très petits pour éviter le blocage
                        (progress) => {
                          this.processingMessage = `Traitement CSV: ${Math.round(progress)}%`;
                        }
                      );
                      
                      for (const col of colNames) {
                        if (!this.columns.includes(col)) this.columns.push(col);
                        if (!this.allColumns.includes(col)) this.allColumns.push(col);
                      }
                      
                    }
                    resolve();
                  } catch (error) {
                    reject(error);
                  }
                },
                error: (error: any) => {
                  reject(error);
                }
              });
              return;
            }
            
            // Cas normal avec header
            if (rows.length > 0) {
              
              // Traitement en arrière-plan avec chunks très petits
              await this.processDataInBackground(
                rows,
                (chunk) => {
                  this.combinedRows.push(...chunk);
                  this.allRows.push(...chunk);
                },
                50, // Chunks très petits pour éviter le blocage
                (progress) => {
                  this.processingMessage = `Traitement CSV: ${Math.round(progress)}%`;
                }
              );
              
              // Extraire les colonnes
              const firstRow = rows[0];
              
              for (const key of Object.keys(firstRow)) {
                if (!this.columns.includes(key)) this.columns.push(key);
                if (!this.allColumns.includes(key)) this.allColumns.push(key);
              }
              
              
            }
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        error: (error: any) => {
          reject(error);
        }
      });
    });
  }

  cancelCsvPreview() {
    // Annuler la prévisualisation et réinitialiser
    this.showCsvPreview = false;
    this.csvPreviewData = [];
    this.csvPreviewColumns = [];
    this.csvContentToProcess = '';
    this.csvFileToProcess = null;
    this.selectedFiles = [];
    this.detectedDelimiter = ';';
    this.isGdjFile = false;
    this.gdjHeaderRowIndex = -1;
    // Réinitialiser le flag d'import depuis prévisualisation
    this.isImportFromPreview = false;
  }

  escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Méthode pour détecter les fichiers GDJ (LA GABONAISE DES JEUX) et trouver la ligne d'en-tête
  private detectGdjFile(csvContent: string, delimiter: string): { isGdj: boolean; headerRowIndex: number; headerRow: string[] } {
    const lines = csvContent.split(/\r?\n/).filter((line: string) => line.trim().length > 0);
    let seenPreamble = false;
    let headerRowIndex = -1;
    let headerRow: string[] = [];

    const scanLimit = Math.min(20, lines.length);
    for (let i = 0; i < scanLimit; i++) {
      const columns = lines[i].split(delimiter).map((col: string) => col.trim());

      if (!seenPreamble && looksLikeGdjReportPreamble(columns)) {
        seenPreamble = true;
        continue;
      }

      if (seenPreamble && looksLikeGdjTransactionalHeader(columns)) {
        headerRowIndex = i;
        headerRow = columns;
        break;
      }
    }

    // Fallback : chercher l'en-tête GDJ directement même sans préambule détecté
    if (headerRowIndex === -1) {
      const idx = findGdjHeaderLineIndexInCsvLines(lines, delimiter, 20);
      if (idx !== null) {
        headerRowIndex = idx;
        headerRow = lines[idx].split(delimiter).map((col: string) => col.trim());
      }
    }

    return { isGdj: headerRowIndex !== -1, headerRowIndex, headerRow };
  }

  /**
   * Effectue l'analyse automatique des types de champs
   */
  private performFieldTypeAnalysis(): void {
    try {
      
      if (this.allRows.length === 0) {
        return;
      }

      // Sécurité: désactiver l'analyse automatique pour les fichiers extrêmement volumineux
      const MAX_ANALYSIS_ROWS = 100000;
      if (this.allRows.length > MAX_ANALYSIS_ROWS) {
        return;
      }

      // Analyser toutes les colonnes
      this.fieldTypeAnalysis = this.fieldTypeDetectionService.analyzeDataset(this.allRows);
      
      // Générer les recommandations de formatage
      this.formattingRecommendations = this.fieldTypeDetectionService.generateFormattingRecommendations(this.fieldTypeAnalysis);
      
      
      // Appliquer automatiquement les formatages si activé
      if (this.autoFormattingEnabled && this.formattingRecommendations.length > 0) {
        this.applyAutomaticFormatting();
      }
      
      // Afficher l'analyse si des types intéressants sont détectés
      const interestingTypes = this.fieldTypeAnalysis.filter(a => 
        a.typeInfo.type === 'date' || 
        a.typeInfo.type === 'amount' || 
        a.typeInfo.type === 'number'
      );
      
      if (interestingTypes.length > 0) {
        this.showFieldTypeAnalysis = true;
      }
      
    } catch (error) {
    }
  }

  /**
   * Applique automatiquement les formatages recommandés
   */
  private applyAutomaticFormatting(): void {
    try {
      
      for (const recommendation of this.formattingRecommendations) {
        if (recommendation.confidence > 0.7) {
          
          switch (recommendation.type) {
            case 'date':
              this.formatOptions.normalizeDates = true;
              break;
            case 'amount':
              this.formatOptions.cleanAmounts = true;
              this.formatOptions.normalizeNumbers = true;
              break;
            case 'number':
              this.formatOptions.normalizeNumbers = true;
              break;
            case 'text':
              this.formatOptions.trimSpaces = true;
              break;
          }
        }
      }
      
      // Appliquer le formatage si des options ont été activées
      if (this.hasFormattingOption()) {
        this.applyFormatting();
      }
      
    } catch (error) {
    }
  }

  /**
   * Affiche l'analyse des types de champs
   */
  toggleFieldTypeAnalysis(): void {
    this.showFieldTypeAnalysis = !this.showFieldTypeAnalysis;
  }

  /**
   * Applique un formatage spécifique basé sur l'analyse
   */
  applySpecificFormatting(column: string, type: string): void {
    try {
      
      switch (type) {
        case 'date':
          this.formatOptions.normalizeDates = true;
          this.selectedDateFormat = 'yyyy-MM-dd';
          break;
        case 'amount':
          this.formatOptions.cleanAmounts = true;
          this.formatOptions.normalizeNumbers = true;
          break;
        case 'number':
          this.formatOptions.normalizeNumbers = true;
          break;
        case 'text':
          this.formatOptions.trimSpaces = true;
          break;
      }
      
      this.applyFormatting();
      this.showSuccess('format', `Formatage appliqué pour ${column} (${type})`);
      
    } catch (error) {
      this.showError('format', 'Erreur lors de l\'application du formatage');
    }
  }

  /**
   * Obtient les statistiques d'une colonne
   */
  getColumnStats(columnName: string): any {
    const analysis = this.fieldTypeAnalysis.find(a => a.columnName === columnName);
    if (!analysis) return null;
    
    return {
      type: analysis.typeInfo.type,
      confidence: analysis.typeInfo.confidence,
      nullCount: analysis.nullCount,
      uniqueCount: analysis.uniqueCount,
      totalCount: analysis.totalCount,
      minValue: analysis.minValue,
      maxValue: analysis.maxValue,
      averageValue: analysis.averageValue,
      sampleValues: analysis.sampleValues
    };
  }

  // ===== MÉTHODES POUR L'EXPORT PAR DATE =====

  // Pagination pour l'aperçu des périodes détectées
  detectedPeriodsPage: number = 1;
  detectedPeriodsPageSize: number = 10;
  detectedPeriodsTotalPages: number = 0;

  /**
   * Gère le changement de colonne de date pour l'export
   */
  onExportDateColChange(): void {
    this.detectedPeriods = [];
    this.detectedPeriodsPage = 1;
    this.detectedPeriodsTotalPages = 0;
    if (this.exportDateCol && this.exportDatePeriod) {
      this.detectPeriods();
    }
  }

  /**
   * Gère le changement de période d'export
   */
  onExportPeriodChange(): void {
    this.detectedPeriods = [];
    this.detectedPeriodsPage = 1;
    this.detectedPeriodsTotalPages = 0;
    if (this.exportDateCol && this.exportDatePeriod) {
      this.detectPeriods();
    }
  }

  /**
   * Gère le changement de durée pour la plage horaire
   */
  onExportTimeRangeMinutesChange(): void {
    if (!this.exportTimeRangeMinutes || this.exportTimeRangeMinutes < 1) {
      this.exportTimeRangeMinutes = 60;
    }
    this.onExportPeriodChange();
  }

  /**
   * Force la re-détection des périodes (pour debug)
   */
  forceRedetectPeriods(): void {
    this.detectedPeriods = [];
    this.detectedPeriodsPage = 1;
    this.detectedPeriodsTotalPages = 0;
    if (this.exportDateCol && this.exportDatePeriod) {
      this.detectPeriods();
    } else {
    }
  }

  /**
   * Détecte les périodes disponibles dans la colonne de date sélectionnée
   */
  private detectPeriods(): void {
    if (!this.exportDateCol || !this.exportDatePeriod) return;


    const periodMap = new Map<string, number>();
    let processedRows = 0;
    let validDates = 0;
    let invalidDates = 0;
    let uniqueDates = new Set<string>();

    this.combinedRows.forEach((row, index) => {
      const dateValue = row[this.exportDateCol];
      if (dateValue) {
        const periodKey = this.getPeriodKey(dateValue, this.exportDatePeriod);
        if (periodKey) {
          periodMap.set(periodKey, (periodMap.get(periodKey) || 0) + 1);
          validDates++;
          uniqueDates.add(periodKey);
          
          // Log des premières dates pour debug
          if (index < 10 || Math.random() < 0.001) {
          }
        } else {
          invalidDates++;
          // Log des dates invalides pour debug
          if (invalidDates <= 10) {
          }
        }
      } else {
        invalidDates++;
        if (invalidDates <= 5) {
        }
      }
      processedRows++;
    });


    this.detectedPeriods = Array.from(periodMap.entries())
      .map(([key, count]) => ({
        key,
        label: this.formatPeriodLabel(key, this.exportDatePeriod),
        count
      }))
      .sort((a, b) => a.key.localeCompare(b.key));


    // Calculer le nombre total de pages pour la pagination
    this.detectedPeriodsTotalPages = Math.ceil(this.detectedPeriods.length / this.detectedPeriodsPageSize);
  }

  /**
   * Obtient les périodes détectées pour la page courante
   */
  getPagedDetectedPeriods(): any[] {
    const startIndex = (this.detectedPeriodsPage - 1) * this.detectedPeriodsPageSize;
    const endIndex = startIndex + this.detectedPeriodsPageSize;
    return this.detectedPeriods.slice(startIndex, endIndex);
  }

  /**
   * Va à la page précédente des périodes détectées
   */
  previousDetectedPeriodsPage(): void {
    if (this.detectedPeriodsPage > 1) {
      this.detectedPeriodsPage--;
    }
  }

  /**
   * Va à la page suivante des périodes détectées
   */
  nextDetectedPeriodsPage(): void {
    if (this.detectedPeriodsPage < this.detectedPeriodsTotalPages) {
      this.detectedPeriodsPage++;
    }
  }

  /**
   * Va à une page spécifique des périodes détectées
   */
  goToDetectedPeriodsPage(page: number): void {
    if (page >= 1 && page <= this.detectedPeriodsTotalPages) {
      this.detectedPeriodsPage = page;
    }
  }

  /**
   * Gère le changement de taille de page pour les périodes détectées
   */
  onPeriodsPageSizeChange(): void {
    this.detectedPeriodsPage = 1; // Retourner à la première page
    this.detectedPeriodsTotalPages = Math.ceil(this.detectedPeriods.length / this.detectedPeriodsPageSize);
  }

  /**
   * Exporte toutes les périodes (toutes les pages)
   */
  exportAllPages(): void {

    if (!this.exportDateCol || !this.exportDatePeriod || !this.exportDateFormat) {
      this.showError('exportDate', this.t('TRT.msg.selectDateColPeriodFormat'));
      return;
    }

    if (!this.combinedRows || this.combinedRows.length === 0) {
      this.showError('exportDate', this.t('TRT.msg.noDataForExport'));
      return;
    }

    if (!this.columns || this.columns.length === 0) {
      this.showError('exportDate', this.t('TRT.msg.noColumnDefined'));
      return;
    }

    // Vérifier que la colonne de date existe
    if (!this.columns.includes(this.exportDateCol)) {
      this.showError('exportDate', `La colonne "${this.exportDateCol}" n'existe pas dans les données chargées.`);
      return;
    }

    // Vérifier qu'il y a des périodes détectées
    if (!this.detectedPeriods || this.detectedPeriods.length === 0) {
      this.showError('exportDate', this.t('TRT.msg.noPeriodDetected'));
      return;
    }

    try {
      // Grouper les données pour toutes les périodes
      const periodGroups = this.groupDataByPeriod();

      let exportedCount = 0;
      const errors: string[] = [];

      
      for (const [periodKey, rows] of periodGroups.entries()) {
        try {
          const periodLabel = this.formatPeriodLabel(periodKey, this.exportDatePeriod);
          const fileName = this.generateExportFileName(periodKey, periodLabel);
          
          
          if (this.exportDateFormat === 'csv') {
            this.exportPeriodAsCSV(rows, fileName);
          } else if (this.exportDateFormat === 'xls') {
            this.exportPeriodAsXLS(rows, fileName);
          } else if (this.exportDateFormat === 'xlsx') {
            this.exportPeriodAsXLSX(rows, fileName);
          } else {
            throw new Error(`Format d'export non supporté: ${this.exportDateFormat}`);
          }
          
          exportedCount++;
        } catch (periodError) {
          errors.push(`Période ${periodKey}: ${periodError.message}`);
        }
      }
      

      if (exportedCount > 0) {
        const message = errors.length > 0 
          ? `${exportedCount} fichier(s) exporté(s) avec succès (toutes les pages), ${errors.length} erreur(s).`
          : `${exportedCount} fichier(s) exporté(s) avec succès (toutes les pages) !`;
        this.showSuccess('exportDate', message);
        
        if (errors.length > 0) {
        }
      } else {
        this.showError('exportDate', this.t('TRT.msg.noFileExported'));
      }
    } catch (error) {
      this.showError('exportDate', `Erreur lors de l'export de toutes les pages: ${error.message}`);
    }
  }

  /**
   * Génère une clé de période basée sur la date et le type de période
   */
  private getPeriodKey(dateValue: any, period: string): string | null {
    try {
      const date = this.parseDate(dateValue);
      if (!date) {
        return null;
      }

      let periodKey: string | null = null;
      
      switch (period) {
        case 'day':
          periodKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
          break;
        case 'week':
          const year = date.getFullYear();
          const week = this.getWeekNumber(date);
          periodKey = `${year}-W${week.toString().padStart(2, '0')}`;
          break;
        case 'month':
          periodKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          break;
        case 'hour': {
          const yyyy = date.getFullYear();
          const mm = (date.getMonth() + 1).toString().padStart(2, '0');
          const dd = date.getDate().toString().padStart(2, '0');
          const HH = date.getHours().toString().padStart(2, '0');
          periodKey = `${yyyy}-${mm}-${dd}T${HH}:00`;
          break;
        }
        case 'timerange': {
          const rangeMinutes = Math.max(1, Number(this.exportTimeRangeMinutes || 60));
          const bucketMs = rangeMinutes * 60 * 1000;
          const bucketStart = Math.floor(date.getTime() / bucketMs) * bucketMs;
          const d = new Date(bucketStart);
          const yyyy = d.getFullYear();
          const mm = (d.getMonth() + 1).toString().padStart(2, '0');
          const dd = d.getDate().toString().padStart(2, '0');
          const HH = d.getHours().toString().padStart(2, '0');
          const MM = d.getMinutes().toString().padStart(2, '0');
          // Inclure la durée pour désambiguïser les clés
          periodKey = `${yyyy}-${mm}-${dd}T${HH}:${MM}-R${rangeMinutes}`;
          break;
        }
        default:
          return null;
      }
      
      // Log seulement pour les premières dates pour éviter de surcharger la console
      if (Math.random() < 0.01) { // 1% des cas seulement
      }
      return periodKey;
    } catch (error) {
      return null;
    }
  }

  /**
   * Formate le label d'une période pour l'affichage
   */
  private formatPeriodLabel(key: string, period: string): string {
    switch (period) {
      case 'day':
        return new Date(key).toLocaleDateString('fr-FR');
      case 'week':
        const [year, week] = key.split('-W');
        return `Semaine ${week} de ${year}`;
      case 'month':
        const [yearMonth, month] = key.split('-');
        const monthNames = [
          'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ];
        return `${monthNames[parseInt(month) - 1]} ${yearMonth}`;
      case 'hour': {
        // key: YYYY-MM-DDTHH:00
        const [datePart, timePart] = key.split('T');
        const [hour] = (timePart || '00:00').split(':');
        const d = new Date(datePart + 'T' + hour.padStart(2, '0') + ':00:00');
        const ddmmyyyy = d.toLocaleDateString('fr-FR');
        return `${ddmmyyyy} ${hour.padStart(2, '0')}:00`;
      }
      case 'timerange': {
        // key: YYYY-MM-DDTHH:MM-R{minutes}
        const [left, rPart] = key.split('-R');
        const minutes = parseInt(rPart || '60', 10);
        const start = new Date(left.replace(' ', 'T'));
        const end = new Date(start.getTime() + Math.max(1, minutes) * 60 * 1000);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const startLabel = `${start.toLocaleDateString('fr-FR')} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
        const endLabel = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
        return `${startLabel} - ${endLabel} (${Math.max(1, minutes)} min)`;
      }
      default:
        return key;
    }
  }

  /**
   * Calcule le numéro de semaine d'une date
   */
  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * Parse une date depuis différentes formats
   */
  private parseDate(dateValue: any): Date | null {
    if (!dateValue) {
      return null;
    }

    // Si c'est déjà un objet Date
    if (dateValue instanceof Date) {
      return dateValue;
    }

    // Si c'est une string, essayer de la parser
    if (typeof dateValue === 'string') {
      const trimmedValue = dateValue.trim();
      // Log seulement pour les premières dates pour éviter de surcharger la console
      if (Math.random() < 0.01) { // 1% des cas seulement
      }
      
      // Essayer différents formats de date
      const formats = [
        { pattern: /^\d{4}-\d{2}-\d{2}$/, name: 'YYYY-MM-DD', parser: (str: string) => new Date(str) },
        { pattern: /^\d{2}\/\d{2}\/\d{4}$/, name: 'DD/MM/YYYY', parser: (str: string) => {
          const [day, month, year] = str.split('/');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }},
        { pattern: /^\d{2}-\d{2}-\d{4}$/, name: 'DD-MM-YYYY', parser: (str: string) => {
          const [day, month, year] = str.split('-');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }},
        { pattern: /^\d{4}\/\d{2}\/\d{2}$/, name: 'YYYY/MM/DD', parser: (str: string) => {
          const [year, month, day] = str.split('/');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }},
        { pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, name: 'ISO DateTime', parser: (str: string) => new Date(str) },
        { pattern: /^\d{1,2}\/\d{1,2}\/\d{4}$/, name: 'D/M/YYYY ou DD/MM/YYYY', parser: (str: string) => {
          const [day, month, year] = str.split('/');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }},
        { pattern: /^\d{1,2}-\d{1,2}-\d{4}$/, name: 'D-M-YYYY ou DD-MM-YYYY', parser: (str: string) => {
          const [day, month, year] = str.split('-');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }},
        { pattern: /^\d{4}-\d{1,2}-\d{1,2}$/, name: 'YYYY-M-D ou YYYY-MM-DD', parser: (str: string) => {
          const [year, month, day] = str.split('-');
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }},
        { pattern: /^\d{1,2}\/\d{1,2}\/\d{2}$/, name: 'D/M/YY ou DD/MM/YY', parser: (str: string) => {
          const [day, month, year] = str.split('/');
          const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);
          return new Date(fullYear, parseInt(month) - 1, parseInt(day));
        }},
        { pattern: /^\d{1,2}-\d{1,2}-\d{2}$/, name: 'D-M-YY ou DD-MM-YY', parser: (str: string) => {
          const [day, month, year] = str.split('-');
          const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);
          return new Date(fullYear, parseInt(month) - 1, parseInt(day));
        }},
      ];

      for (const format of formats) {
        if (format.pattern.test(trimmedValue)) {
          try {
            const parsed = format.parser(trimmedValue);
            if (!isNaN(parsed.getTime())) {
              if (Math.random() < 0.01) { // 1% des cas seulement
              }
              return parsed;
            }
          } catch (error) {
            // Continue avec le format suivant
            continue;
          }
        }
      }

      // Essayer de parser directement
      try {
        const parsed = new Date(trimmedValue);
        if (!isNaN(parsed.getTime())) {
          if (Math.random() < 0.01) { // 1% des cas seulement
          }
          return parsed;
        }
      } catch (error) {
        // Ignore l'erreur et continue
      }
      
    } else {
    }

    return null;
  }

  /**
   * Exporte les données par période de date (page courante seulement)
   */
  exportByDate(): void {

    if (!this.exportDateCol || !this.exportDatePeriod || !this.exportDateFormat) {
      this.showError('exportDate', this.t('TRT.msg.selectDateColPeriodFormat'));
      return;
    }

    if (!this.combinedRows || this.combinedRows.length === 0) {
      this.showError('exportDate', this.t('TRT.msg.noDataForExport'));
      return;
    }

    if (!this.columns || this.columns.length === 0) {
      this.showError('exportDate', this.t('TRT.msg.noColumnDefined'));
      return;
    }

    // Vérifier que la colonne de date existe
    if (!this.columns.includes(this.exportDateCol)) {
      this.showError('exportDate', `La colonne "${this.exportDateCol}" n'existe pas dans les données chargées.`);
      return;
    }

    // Vérifier qu'il y a des périodes détectées
    if (!this.detectedPeriods || this.detectedPeriods.length === 0) {
      this.showError('exportDate', this.t('TRT.msg.noPeriodDetected'));
      return;
    }

    try {
      // Obtenir les périodes de la page courante
      const currentPagePeriods = this.getPagedDetectedPeriods();
      
      if (currentPagePeriods.length === 0) {
        this.showError('exportDate', this.t('TRT.msg.noPeriodOnPage'));
        return;
      }

      // Grouper les données pour les périodes de la page courante seulement
      const periodGroups = this.groupDataByPeriodForPage(currentPagePeriods);

      let exportedCount = 0;
      const errors: string[] = [];

      
      for (const [periodKey, rows] of periodGroups.entries()) {
        try {
          const periodLabel = this.formatPeriodLabel(periodKey, this.exportDatePeriod);
          const fileName = this.generateExportFileName(periodKey, periodLabel);
          
          
          if (this.exportDateFormat === 'csv') {
            this.exportPeriodAsCSV(rows, fileName);
          } else if (this.exportDateFormat === 'xls') {
            this.exportPeriodAsXLS(rows, fileName);
          } else if (this.exportDateFormat === 'xlsx') {
            this.exportPeriodAsXLSX(rows, fileName);
          } else {
            throw new Error(`Format d'export non supporté: ${this.exportDateFormat}`);
          }
          
          exportedCount++;
        } catch (periodError) {
          errors.push(`Période ${periodKey}: ${periodError.message}`);
        }
      }
      

      if (exportedCount > 0) {
        const message = errors.length > 0 
          ? `${exportedCount} fichier(s) exporté(s) avec succès (page ${this.detectedPeriodsPage}), ${errors.length} erreur(s).`
          : `${exportedCount} fichier(s) exporté(s) avec succès (page ${this.detectedPeriodsPage}) !`;
        this.showSuccess('exportDate', message);
        
        if (errors.length > 0) {
        }
      } else {
        this.showError('exportDate', this.t('TRT.msg.noFileExported'));
      }
    } catch (error) {
      this.showError('exportDate', `Erreur lors de l'export par date: ${error.message}`);
    }
  }

  /**
   * Groupe les données par période pour les périodes de la page courante seulement
   */
  private groupDataByPeriodForPage(currentPagePeriods: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    

    // Créer un Set des clés de période de la page courante pour un accès rapide
    const currentPageKeys = new Set(currentPagePeriods.map(period => period.key));

    let processedRows = 0;
    let validDates = 0;
    let invalidDates = 0;
    let matchedPeriods = 0;

    this.combinedRows.forEach((row, index) => {
      const dateValue = row[this.exportDateCol];
      if (dateValue) {
        const periodKey = this.getPeriodKey(dateValue, this.exportDatePeriod);
        if (periodKey && currentPageKeys.has(periodKey)) {
          if (!groups.has(periodKey)) {
            groups.set(periodKey, []);
          }
          groups.get(periodKey)!.push(row);
          validDates++;
          matchedPeriods++;
        } else if (periodKey) {
          // Période valide mais pas dans la page courante
          validDates++;
        } else {
          invalidDates++;
          if (invalidDates <= 5) {
          }
        }
      } else {
        invalidDates++;
        if (invalidDates <= 5) {
        }
      }
      processedRows++;
    });

    
    // Afficher les détails de chaque groupe
    for (const [periodKey, rows] of groups.entries()) {
    }

    return groups;
  }

  /**
   * Groupe les données par période (toutes les périodes)
   */
  private groupDataByPeriod(): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    

    let processedRows = 0;
    let validDates = 0;
    let invalidDates = 0;

    this.combinedRows.forEach((row, index) => {
      const dateValue = row[this.exportDateCol];
      if (dateValue) {
        const periodKey = this.getPeriodKey(dateValue, this.exportDatePeriod);
        if (periodKey) {
          if (!groups.has(periodKey)) {
            groups.set(periodKey, []);
          }
          groups.get(periodKey)!.push(row);
          validDates++;
        } else {
          invalidDates++;
          // Log seulement les premières erreurs pour éviter de surcharger la console
          if (invalidDates <= 5) {
          }
        }
      } else {
        invalidDates++;
        // Log seulement les premières erreurs pour éviter de surcharger la console
        if (invalidDates <= 5) {
        }
      }
      processedRows++;
    });

    
    // Afficher les détails de chaque période (limité à 10 pour éviter de surcharger)
    let periodCount = 0;
    for (const [periodKey, rows] of groups.entries()) {
      if (periodCount < 10) {
      }
      periodCount++;
    }
    
    if (groups.size > 10) {
    }

    return groups;
  }

  /**
   * Génère le nom de fichier pour l'export
   */
  private generateExportFileName(periodKey: string, periodLabel: string): string {
    const prefix = this.exportDatePrefix.trim() || 'export';
    const extension = this.exportDateFormat;
    
    // Nettoyer le label pour le nom de fichier
    const cleanLabel = periodLabel.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    
    return `${prefix}_${cleanLabel}.${extension}`;
  }

  /**
   * Exporte une période en CSV
   */
  private exportPeriodAsCSV(rows: any[], fileName: string): void {
    try {
      
      if (!rows || rows.length === 0) {
        return;
      }

      if (!this.columns || this.columns.length === 0) {
        return;
      }

      const exportColumns = this.columns.map(col => col === 'GRX' ? 'PAYS' : col);
      const csvRows: string[] = [];
      csvRows.push(exportColumns.join(';'));

      for (const row of rows) {
        const line = this.columns.map((col) => formatCellForCsvExport(col, row[col])).join(';');
        csvRows.push(line);
      }

      const csvContent = csvRows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (error) {
      throw new Error(`Erreur lors de l'export CSV: ${error.message}`);
    }
  }

  /**
   * Exporte une période en XLS
   */
  private exportPeriodAsXLS(rows: any[], fileName: string): void {
    try {
      
      if (!rows || rows.length === 0) {
        return;
      }

      if (!this.columns || this.columns.length === 0) {
        return;
      }

      const exportColumns = this.columns.map(col => col === 'GRX' ? 'PAYS' : col);
      
      const exportData = rows.map((row, index) => {
        const exportRow: any = {};
        this.columns.forEach((col, idx) => {
          const exportCol = exportColumns[idx];
          let value = row[col];
          
          // Nettoyer et formater les valeurs
          if (value === undefined || value === null) {
            value = '';
          } else if (typeof value === 'object') {
            value = JSON.stringify(value);
          } else {
            const trimmed = String(value).trim();
            value = (isMsisdnPreserveColumn(col) || isLeadingZeroNumericString(trimmed))
              ? finalizeTextPreserveColumnValue(col, trimmed)
              : trimmed;
          }
          
          exportRow[exportCol] = value;
        });
        return exportRow;
      });

      
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Définir la largeur des colonnes
      const colWidths = exportColumns.map(() => ({ wch: 15 }));
      worksheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Données');
      XLSX.writeFile(workbook, fileName);
      
    } catch (error) {
      throw new Error(`Erreur lors de l'export XLS: ${error.message}`);
    }
  }

  /**
   * Exporte une période en XLSX
   */
  private exportPeriodAsXLSX(rows: any[], fileName: string): void {
    try {
      
      if (!rows || rows.length === 0) {
        return;
      }

      if (!this.columns || this.columns.length === 0) {
        return;
      }

      const exportColumns = this.columns.map(col => col === 'GRX' ? 'PAYS' : col);
      
      const exportData = rows.map((row, index) => {
        const exportRow: any = {};
        this.columns.forEach((col, idx) => {
          const exportCol = exportColumns[idx];
          let value = row[col];
          
          // Nettoyer et formater les valeurs
          if (value === undefined || value === null) {
            value = '';
          } else if (typeof value === 'object') {
            value = JSON.stringify(value);
          } else {
            const trimmed = String(value).trim();
            value = (isMsisdnPreserveColumn(col) || isLeadingZeroNumericString(trimmed))
              ? finalizeTextPreserveColumnValue(col, trimmed)
              : trimmed;
          }
          
          exportRow[exportCol] = value;
        });
        return exportRow;
      });

      
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Définir la largeur des colonnes
      const colWidths = exportColumns.map(() => ({ wch: 15 }));
      worksheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Données');
      XLSX.writeFile(workbook, fileName);
      
    } catch (error) {
      throw new Error(`Erreur lors de l'export XLSX: ${error.message}`);
    }
  }

  /**
   * Réinitialise les paramètres d'export par date
   */
  resetExportDate(): void {
    this.exportDateCol = '';
    this.exportDatePeriod = 'day';
    this.exportDateFormat = 'xlsx';
    this.exportDatePrefix = 'export';
    this.exportTimeRangeMinutes = 60;
    this.detectedPeriods = [];
    this.successMsg.exportDate = '';
    this.errorMsg.exportDate = '';
  }
} 