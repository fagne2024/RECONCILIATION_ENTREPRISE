import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';

export interface ExcelStyle {
    font?: {
        name?: string;
        size?: number;
        bold?: boolean;
        italic?: boolean;
        color?: string;
    };
    fill?: {
        fgColor?: string;
        bgColor?: string;
        pattern?: string;
    };
    border?: {
        top?: { style?: string; color?: string };
        bottom?: { style?: string; color?: string };
        left?: { style?: string; color?: string };
        right?: { style?: string; color?: string };
    };
    alignment?: {
        horizontal?: string;
        vertical?: string;
        wrapText?: boolean;
    };
    numberFormat?: string;
}

export interface ExcelColumn {
    header: string;
    key: string;
    width?: number;
    style?: ExcelStyle;
}

@Injectable({
    providedIn: 'root'
})
export class ModernExcelExportService {

    /**
     * Exporte des données vers Excel avec un style moderne et coloré
     */
    exportModernExcel(
        data: any[], 
        columns: ExcelColumn[], 
        fileName: string,
        sheetName: string = 'Rapport'
    ): void {
        try {
            // Créer un nouveau workbook
            const wb = XLSX.utils.book_new();
            
            // Préparer les données avec les styles
            const wsData = this.prepareWorksheetData(data, columns);
            
            // Créer la feuille de calcul
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            
            // Appliquer les styles et formats
            this.applyModernStyles(ws, columns, data.length);
            
            // Ajuster les largeurs de colonnes
            this.adjustColumnWidths(ws, columns);
            
            // Ajouter la feuille au workbook
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            
            // Exporter le fichier
            XLSX.writeFile(wb, fileName);
            
        } catch (error) {
            console.error('Erreur export Excel moderne:', error);
            throw new Error('Impossible de générer le fichier Excel');
        }
    }

    /**
     * Prépare les données de la feuille avec les en-têtes
     */
    private prepareWorksheetData(data: any[], columns: ExcelColumn[]): any[][] {
        const wsData: any[][] = [];
        
        // Ajouter les en-têtes
        const headers = columns.map(col => col.header);
        wsData.push(headers);
        
        // Ajouter les données
        data.forEach(row => {
            const rowData = columns.map(col => {
                const value = row[col.key];
                return this.formatCellValue(value, col);
            });
            wsData.push(rowData);
        });
        
        return wsData;
    }

    /**
     * Formate la valeur d'une cellule selon le type de colonne
     */
    private formatCellValue(value: any, column: ExcelColumn): any {
        if (value === null || value === undefined) return '';
        
        // Formatage spécial pour les pourcentages
        if (column.key.includes('Taux') || column.key.includes('Rate')) {
            if (typeof value === 'string' && value.includes('%')) {
                return parseFloat(value.replace('%', ''));
            }
            return typeof value === 'number' ? value : parseFloat(value) || 0;
        }
        
        // Formatage pour les nombres
        if (column.key.includes('Transaction') || column.key.includes('Volume') || 
            column.key.includes('Correspondance') || column.key.includes('Écart')) {
            return typeof value === 'number' ? value : parseFloat(value) || 0;
        }
        
        return value;
    }

    /**
     * Applique les styles modernes à la feuille
     */
    private applyModernStyles(ws: XLSX.WorkSheet, columns: ExcelColumn[], dataLength: number): void {
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        
        // Styles pour les en-têtes
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
            if (!ws[cellAddress]) continue;
            
            ws[cellAddress].s = {
                font: {
                    name: 'Calibri',
                    size: 12,
                    bold: true,
                    color: 'FFFFFF'
                },
                fill: {
                    fgColor: { rgb: '2E86AB' }, // Bleu moderne
                    pattern: 'solid'
                },
                border: {
                    top: { style: 'thin', color: 'FFFFFF' },
                    bottom: { style: 'thin', color: 'FFFFFF' },
                    left: { style: 'thin', color: 'FFFFFF' },
                    right: { style: 'thin', color: 'FFFFFF' }
                },
                alignment: {
                    horizontal: 'center',
                    vertical: 'middle',
                    wrapText: true
                }
            };
        }
        
        // Styles pour les données
        for (let row = 1; row <= dataLength; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                if (!ws[cellAddress]) continue;
                
                const column = columns[col];
                const cellValue = ws[cellAddress].v;
                
                // Style de base
                let cellStyle: any = {
                    font: {
                        name: 'Calibri',
                        size: 11,
                        color: '000000'
                    },
                    fill: {
                        fgColor: { rgb: row % 2 === 0 ? 'F8F9FA' : 'FFFFFF' }, // Alternance de couleurs
                        pattern: 'solid'
                    },
                    border: {
                        top: { style: 'thin', color: 'E9ECEF' },
                        bottom: { style: 'thin', color: 'E9ECEF' },
                        left: { style: 'thin', color: 'E9ECEF' },
                        right: { style: 'thin', color: 'E9ECEF' }
                    },
                    alignment: {
                        horizontal: 'left',
                        vertical: 'middle',
                        wrapText: false
                    }
                };
                
                // Styles conditionnels selon le type de colonne
                if (column.key.includes('Taux') || column.key.includes('Rate')) {
                    cellStyle.alignment.horizontal = 'center';
                    cellStyle.numberFormat = '0.00%';
                    
                    // Couleur selon la performance
                    const rate = parseFloat(cellValue) || 0;
                    if (rate >= 95) {
                        cellStyle.font.color = '28A745'; // Vert
                        cellStyle.font.bold = true;
                    } else if (rate >= 85) {
                        cellStyle.font.color = '17A2B8'; // Bleu
                    } else if (rate >= 70) {
                        cellStyle.font.color = 'FFC107'; // Jaune
                    } else {
                        cellStyle.font.color = 'DC3545'; // Rouge
                        cellStyle.font.bold = true;
                    }
                } else if (column.key.includes('Transaction') || column.key.includes('Volume')) {
                    cellStyle.alignment.horizontal = 'right';
                    cellStyle.numberFormat = '#,##0';
                } else if (column.key.includes('Statut')) {
                    cellStyle.alignment.horizontal = 'center';
                    
                    // Couleur selon le statut
                    if (cellValue === 'OK') {
                        cellStyle.font.color = '28A745';
                        cellStyle.font.bold = true;
                    } else if (cellValue === 'NOK') {
                        cellStyle.font.color = 'DC3545';
                        cellStyle.font.bold = true;
                    } else if (cellValue.includes('EN COURS')) {
                        cellStyle.font.color = 'FFC107';
                        cellStyle.font.bold = true;
                    }
                } else if (column.key.includes('Date')) {
                    cellStyle.alignment.horizontal = 'center';
                    cellStyle.numberFormat = 'dd/mm/yyyy';
                }
                
                ws[cellAddress].s = cellStyle;
            }
        }
    }

    /**
     * Ajuste les largeurs des colonnes
     */
    private adjustColumnWidths(ws: XLSX.WorkSheet, columns: ExcelColumn[]): void {
        const colWidths: any[] = [];
        
        columns.forEach((column, index) => {
            let width = column.width || 15; // Largeur par défaut
            
            // Ajustements selon le type de colonne
            if (column.key.includes('Date')) {
                width = 12;
            } else if (column.key.includes('Agence') || column.key.includes('Service')) {
                width = 20;
            } else if (column.key.includes('Transaction') || column.key.includes('Volume')) {
                width = 15;
            } else if (column.key.includes('Commentaire')) {
                width = 30;
            } else if (column.key.includes('Statut')) {
                width = 12;
            }
            
            colWidths[index] = { wch: width };
        });
        
        ws['!cols'] = colWidths;
    }

    /**
     * Exporte un rapport complet avec plusieurs feuilles
     */
    exportCompleteReport(
        data: any[],
        fileName: string,
        includeSummary: boolean = true
    ): void {
        try {
            const wb = XLSX.utils.book_new();
            
            // Feuille 1: Données détaillées
            const detailColumns: ExcelColumn[] = [
                { header: 'Date', key: 'Date', width: 12 },
                { header: 'Agence', key: 'Agence', width: 20 },
                { header: 'Service', key: 'Service', width: 20 },
                { header: 'Pays', key: 'Pays', width: 8 },
                { header: 'Transactions', key: 'Transactions', width: 15 },
                { header: 'Volume', key: 'Volume', width: 15 },
                { header: 'Correspondances', key: 'Correspondances', width: 15 },
                { header: 'Écarts BO', key: 'Écarts BO', width: 12 },
                { header: 'Écarts Partenaire', key: 'Écarts Partenaire', width: 18 },
                { header: 'Incohérences', key: 'Incohérences', width: 15 },
                { header: 'Taux de Correspondance', key: 'Taux de Correspondance', width: 20 },
                { header: 'Statut', key: 'Statut', width: 12 },
                { header: 'Commentaire', key: 'Commentaire', width: 30 },
                { header: 'ID GLPI', key: 'ID GLPI', width: 15 }
            ];
            
            const detailData = this.prepareWorksheetData(data, detailColumns);
            const detailWs = XLSX.utils.aoa_to_sheet(detailData);
            this.applyModernStyles(detailWs, detailColumns, data.length);
            this.adjustColumnWidths(detailWs, detailColumns);
            XLSX.utils.book_append_sheet(wb, detailWs, 'Détail');
            
            // Feuille 2: Résumé (si demandé)
            if (includeSummary && data.length > 0) {
                const summaryData = this.generateSummaryData(data);
                const summaryColumns: ExcelColumn[] = [
                    { header: 'Métrique', key: 'metric', width: 25 },
                    { header: 'Valeur', key: 'value', width: 20 },
                    { header: 'Description', key: 'description', width: 40 }
                ];
                
                const summaryWs = XLSX.utils.aoa_to_sheet(
                    this.prepareWorksheetData(summaryData, summaryColumns)
                );
                this.applyModernStyles(summaryWs, summaryColumns, summaryData.length);
                this.adjustColumnWidths(summaryWs, summaryColumns);
                XLSX.utils.book_append_sheet(wb, summaryWs, 'Résumé');
            }
            
            // Exporter le fichier
            XLSX.writeFile(wb, fileName);
            
        } catch (error) {
            console.error('Erreur export rapport complet:', error);
            throw new Error('Impossible de générer le rapport complet');
        }
    }

    /**
     * Génère les données de résumé
     */
    private generateSummaryData(data: any[]): any[] {
        const totalTransactions = data.reduce((sum, item) => sum + (item.Transactions || 0), 0);
        const totalVolume = data.reduce((sum, item) => sum + (item.Volume || 0), 0);
        const totalMatches = data.reduce((sum, item) => sum + (item.Correspondances || 0), 0);
        const averageRate = totalTransactions > 0 ? (totalMatches / totalTransactions) * 100 : 0;
        const uniqueAgencies = new Set(data.map(item => item.Agence)).size;
        const uniqueServices = new Set(data.map(item => item.Service)).size;
        
        return [
            { metric: 'Total Transactions', value: totalTransactions, description: 'Nombre total de transactions' },
            { metric: 'Volume Total', value: totalVolume, description: 'Volume total traité' },
            { metric: 'Taux Moyen', value: `${averageRate.toFixed(2)}%`, description: 'Taux de correspondance moyen' },
            { metric: 'Nombre d\'Agences', value: uniqueAgencies, description: 'Agences impliquées' },
            { metric: 'Nombre de Services', value: uniqueServices, description: 'Services utilisés' },
            { metric: 'Période', value: this.getDateRange(data), description: 'Période couverte par le rapport' }
        ];
    }

    /**
     * Obtient la plage de dates des données
     */
    private getDateRange(data: any[]): string {
        if (data.length === 0) return 'Aucune donnée';
        
        const dates = data.map(item => new Date(item.Date)).filter(date => !isNaN(date.getTime()));
        if (dates.length === 0) return 'Dates invalides';
        
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        return `${minDate.toLocaleDateString('fr-FR')} - ${maxDate.toLocaleDateString('fr-FR')}`;
    }
}
