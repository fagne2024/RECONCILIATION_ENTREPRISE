import { Request, Response } from 'express';
import { AgencySummarySaveRequest } from '../models/agency-summary.model';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const saveAgencySummary = async (req: Request, res: Response) => {
    try {
        const { summary, timestamp }: AgencySummarySaveRequest = req.body;

        // Sauvegarder le résumé dans la base de données
        const savedSummary = await prisma.agencySummary.create({
            data: {
                timestamp: new Date(timestamp),
                details: summary
            }
        });

        res.status(200).json({
            success: true,
            message: 'Résumé par agence sauvegardé avec succès',
            data: savedSummary
        });
    } catch (error) {
        console.error('Erreur lors de la sauvegarde du résumé par agence:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la sauvegarde du résumé par agence',
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
};

export const getAgencySummaries = async (req: Request, res: Response) => {
    try {
        const summaries = await prisma.agencySummary.findMany({
            orderBy: {
                timestamp: 'desc'
            }
        });

        res.status(200).json({
            success: true,
            data: summaries
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des résumés par agence:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des résumés par agence',
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
};

export const exportAllAgencySummaries = async (req: Request, res: Response) => {
    try {
        const summaries = await prisma.agencySummary.findMany({
            orderBy: {
                timestamp: 'desc'
            },
            select: {
                details: true,
                timestamp: true
            }
        });

        // Transformer les données pour l'export
        const exportData = summaries.flatMap(summary => {
            const details = summary.details as AgencySummary[];
            return details.map(detail => ({
                ...detail,
                exportDate: summary.timestamp
            }));
        });

        res.status(200).json({
            success: true,
            data: exportData
        });
    } catch (error) {
        console.error('Erreur lors de l\'export des résumés par agence:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'export des résumés par agence',
            error: error instanceof Error ? error.message : 'Erreur inconnue'
        });
    }
}; 