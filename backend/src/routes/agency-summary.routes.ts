import { Router } from 'express';
import { saveAgencySummary, getAgencySummaries, exportAllAgencySummaries } from '../controllers/agency-summary.controller';

const router = Router();

router.post('/save', saveAgencySummary);
router.get('/', getAgencySummaries);
router.get('/export', exportAllAgencySummaries);

export default router; 