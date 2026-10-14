import express from 'express';
import cors from 'cors';
import reconciliationRoutes from './routes/reconciliation.routes';
import agencySummaryRoutes from './routes/agency-summary.routes';
import fileWatcherRoutes from './routes/file-watcher.routes';

const app = express();

// Sécurité : Masquer l'en-tête X-Powered-By pour ne pas divulguer Express
app.disable('x-powered-by');

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/agency-summary', agencySummaryRoutes);
app.use('/api/file-watcher', fileWatcherRoutes);

export default app; 