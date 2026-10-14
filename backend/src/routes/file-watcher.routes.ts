import { Router } from 'express';
import { FileWatcherController } from '../controllers/file-watcher.controller';
import { FileWatcherService } from '../services/file-watcher.service';

const router = Router();

// Créer une instance du service et du contrôleur
const fileWatcherService = new FileWatcherService();
const fileWatcherController = new FileWatcherController(fileWatcherService);

// Routes pour la surveillance
router.post('/start', fileWatcherController.startWatching);
router.post('/stop', fileWatcherController.stopWatching);
router.get('/status', fileWatcherController.getStatus);

// Routes pour les spécifications
router.post('/specifications', fileWatcherController.createSpecification);
router.get('/specifications', fileWatcherController.getSpecifications);
router.get('/specifications/:id', fileWatcherController.getSpecification);
router.put('/specifications/:id', fileWatcherController.updateSpecification);
router.delete('/specifications/:id', fileWatcherController.deleteSpecification);

// Routes pour le traitement manuel
router.post('/process-file', fileWatcherController.processFile);

// Route pour analyser un fichier
router.post('/analyze-file', fileWatcherController.analyzeFile);

// Route pour obtenir les fichiers disponibles
router.get('/available-files', fileWatcherController.getAvailableFiles);

// Routes pour les exemples
router.get('/examples', fileWatcherController.getExampleSpecifications);

export default router; 