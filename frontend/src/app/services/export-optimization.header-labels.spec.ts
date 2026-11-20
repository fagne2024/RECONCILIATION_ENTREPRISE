// ExcelJS (ESM via uuid) n'est pas chargeable sous Jest et ne sert pas aux exports CSV testés.
jest.mock('exceljs', () => ({}));

import { TextEncoder } from 'util';
import { ExportOptimizationService } from './export-optimization.service';

// jsdom ne fournit pas TextEncoder (utilisé par l'export CSV par lots).
(globalThis as any).TextEncoder = (globalThis as any).TextEncoder ?? TextEncoder;

describe('ExportOptimizationService — libellés d’en-tête (GRX exporté sous PAYS)', () => {
  const rows = [
    { Service: 'BF_PAIEMENTMARCHAND_OM_TP', GRX: 'BF' },
    { Service: 'BF_PAIEMENTMARCHAND_MOBICASH_TP', GRX: 'BF' }
  ];

  const lireCsv = async (blob: Blob): Promise<string> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).replace(/^﻿/, ''));
      reader.readAsText(blob);
    });

  it('export rapide CSV : en-tête PAYS, valeurs lues sous GRX', async () => {
    const service = new ExportOptimizationService();
    let blob: Blob | null = null;
    (service as any).downloadFile = (b: Blob) => { blob = b; };

    service.exportQuick(rows, ['Service', 'GRX'], 'resultat.csv', 'csv', { GRX: 'PAYS' });

    const lignes = (await lireCsv(blob!)).split('\r\n');
    expect(lignes[0]).toBe('Service;PAYS');
    expect(lignes[1]).toBe('BF_PAIEMENTMARCHAND_OM_TP;BF');
    expect(lignes[2]).toBe('BF_PAIEMENTMARCHAND_MOBICASH_TP;BF');
  });

  it('export CSV par lots : en-tête PAYS, valeurs lues sous GRX', async () => {
    const service = new ExportOptimizationService();
    let blob: Blob | null = null;
    (service as any).downloadFile = (b: Blob) => { blob = b; };

    await service.exportCSVOptimized(rows, ['Service', 'GRX'], 'resultat.csv', {
      headerLabels: { GRX: 'PAYS' },
      yieldFn: async () => undefined
    });

    const lignes = (await lireCsv(blob!)).split('\r\n');
    expect(lignes[0]).toBe('Service;PAYS');
    expect(lignes[1]).toBe('BF_PAIEMENTMARCHAND_OM_TP;BF');
  });
});
