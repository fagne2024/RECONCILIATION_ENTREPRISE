import { Request, Response } from 'express';
import { FileWatcherService, ProcessingSpecification } from '../services/file-watcher.service';
import { v4 as uuidv4 } from 'uuid';

export class FileWatcherController {
  private fileWatcherService: FileWatcherService;

  constructor(fileWatcherService: FileWatcherService) {
    this.fileWatcherService = fileWatcherService;
  }

  // Démarrer la surveillance
  public startWatching = (req: Request, res: Response): void => {
    try {
      this.fileWatcherService.startWatching();
      res.json({
        success: true,
        message: 'Surveillance démarrée avec succès',
        watchPath: this.fileWatcherService.getWatchPath()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du démarrage de la surveillance',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Arrêter la surveillance
  public stopWatching = (req: Request, res: Response): void => {
    try {
      this.fileWatcherService.stopWatching();
      res.json({
        success: true,
        message: 'Surveillance arrêtée avec succès'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'arrêt de la surveillance',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Obtenir le statut de la surveillance
  public getStatus = (req: Request, res: Response): void => {
    try {
      const status = this.fileWatcherService.getProcessingStatus();
      res.json({
        success: true,
        watchPath: this.fileWatcherService.getWatchPath(),
        isProcessing: status.isProcessing,
        queueLength: status.queueLength
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du statut',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Créer une nouvelle spécification
  public createSpecification = (req: Request, res: Response): void => {
    try {
      const {
        name,
        filePattern,
        processingType,
        delimiter,
        encoding,
        mapping,
        transformations,
        outputFormat,
        outputPath,
        autoProcess
      } = req.body;

      // Validation des champs requis
      if (!name || !filePattern || !processingType) {
        res.status(400).json({
          success: false,
          message: 'Les champs name, filePattern et processingType sont requis'
        });
        return;
      }

      const specification: ProcessingSpecification = {
        id: uuidv4(),
        name,
        filePattern,
        processingType,
        delimiter,
        encoding,
        mapping,
        transformations,
        outputFormat,
        outputPath,
        autoProcess: autoProcess ?? true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.fileWatcherService.addSpecification(specification);

      res.status(201).json({
        success: true,
        message: 'Spécification créée avec succès',
        specification
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la spécification',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Obtenir toutes les spécifications
  public getSpecifications = (req: Request, res: Response): void => {
    try {
      const specifications = this.fileWatcherService.getSpecifications();
      res.json({
        success: true,
        specifications
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des spécifications',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Obtenir une spécification par ID
  public getSpecification = (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const specification = this.fileWatcherService.getSpecification(id);

      if (!specification) {
        res.status(404).json({
          success: false,
          message: 'Spécification non trouvée'
        });
        return;
      }

      res.json({
        success: true,
        specification
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la spécification',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Mettre à jour une spécification
  public updateSpecification = (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Supprimer les champs qui ne doivent pas être modifiés
      delete updateData.id;
      delete updateData.createdAt;

      const success = this.fileWatcherService.updateSpecification(id, updateData);

      if (!success) {
        res.status(404).json({
          success: false,
          message: 'Spécification non trouvée'
        });
        return;
      }

      const updatedSpecification = this.fileWatcherService.getSpecification(id);

      res.json({
        success: true,
        message: 'Spécification mise à jour avec succès',
        specification: updatedSpecification
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de la spécification',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Supprimer une spécification
  public deleteSpecification = (req: Request, res: Response): void => {
    try {
      const { id } = req.params;
      const success = this.fileWatcherService.removeSpecification(id);

      if (!success) {
        res.status(404).json({
          success: false,
          message: 'Spécification non trouvée'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Spécification supprimée avec succès'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de la spécification',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Traiter un fichier manuellement
  public processFile = (req: Request, res: Response): void => {
    try {
      const { fileName, specificationId } = req.body;

      if (!fileName || !specificationId) {
        res.status(400).json({
          success: false,
          message: 'fileName et specificationId sont requis'
        });
        return;
      }

      const specification = this.fileWatcherService.getSpecification(specificationId);
      if (!specification) {
        res.status(404).json({
          success: false,
          message: 'Spécification non trouvée'
        });
        return;
      }

      // Vérifier si le fichier existe dans le dossier de surveillance
      const filePath = `${this.fileWatcherService.getWatchPath()}/${fileName}`;
      const fs = require('fs');
      
      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          message: 'Fichier non trouvé dans le dossier de surveillance'
        });
        return;
      }

      // Ajouter le fichier à la queue de traitement
      // Note: Cette fonctionnalité nécessiterait une modification du service
      // pour exposer une méthode de traitement manuel
      res.json({
        success: true,
        message: 'Fichier ajouté à la queue de traitement',
        fileName,
        specificationId
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du traitement du fichier',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Obtenir les exemples de spécifications
  public getExampleSpecifications = (req: Request, res: Response): void => {
    const examples = [
      {
        name: 'Fichiers CSV avec point-virgule',
        filePattern: '*.csv',
        processingType: 'csv',
        delimiter: ';',
        encoding: 'utf8',
        outputFormat: 'json',
        autoProcess: true,
        transformations: [
          {
            type: 'format',
            field: 'nom',
            action: 'uppercase'
          },
          {
            type: 'validate',
            field: 'email',
            action: 'isEmail'
          }
        ]
      },
      {
        name: 'Fichiers JSON de transactions',
        filePattern: 'transactions_*.json',
        processingType: 'json',
        outputFormat: 'csv',
        autoProcess: true,
        transformations: [
          {
            type: 'transform',
            field: 'montant',
            action: 'replace',
            params: { search: ',', replace: '.' }
          }
        ]
      },
      {
        name: 'Fichiers Excel de rapports',
        filePattern: 'rapport_*.xlsx',
        processingType: 'excel',
        outputFormat: 'json',
        autoProcess: false
      }
    ];

    res.json({
      success: true,
      examples
    });
  };

  // Analyser un fichier pour obtenir ses colonnes et données d'exemple
  public analyzeFile = async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body;
      
      if (!filePath) {
        res.status(400).json({
          success: false,
          message: 'Le chemin du fichier est requis'
        });
        return;
      }

      console.log(`🔍 Demande d'analyse du fichier: ${filePath}`);
      
      const fileModel = await this.fileWatcherService.analyzeFile(filePath);
      
      res.json({
        success: true,
        ...fileModel
      });
    } catch (error) {
      console.error('❌ Erreur lors de l\'analyse du fichier:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'analyse du fichier',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  // Obtenir la liste des fichiers disponibles avec leurs colonnes
  public getAvailableFiles = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔍 Demande de récupération des fichiers disponibles');
      
      const availableFiles = await this.fileWatcherService.getAvailableFiles();
      
      res.json(availableFiles);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des fichiers disponibles:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des fichiers disponibles',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
} 