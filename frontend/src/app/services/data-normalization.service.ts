import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DataNormalizationService {
  private readonly columnHeaders = new Set([
    'Agence',
    'Agency',
    'Service',
    'Date',
    'Volume',
    'Total'
  ]);
} 