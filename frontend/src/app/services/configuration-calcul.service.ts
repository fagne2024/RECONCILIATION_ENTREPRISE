import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, finalize, map, tap } from 'rxjs/operators';
import {
  CalculationFormulaTerm,
  CalculationRule
} from '../models/calculation-rule.model';

/**
 * Service des règles de calcul configurables (Configuration > Calcul).
 * Sert à la fois à la page d'administration et aux moteurs de calcul,
 * qui lisent les règles avec un repli sur des valeurs par défaut.
 */
@Injectable({ providedIn: 'root' })
export class ConfigurationCalculService {

  private readonly apiUrl = '/api/configuration/calcul';

  private readonly rulesSubject = new BehaviorSubject<CalculationRule[]>([]);
  readonly rules$: Observable<CalculationRule[]> = this.rulesSubject.asObservable();

  private loading = false;

  constructor(private http: HttpClient) {}

  // ------------------------------------------------------------------
  // API CRUD
  // ------------------------------------------------------------------

  list(module?: string): Observable<CalculationRule[]> {
    const url = module ? `${this.apiUrl}?module=${encodeURIComponent(module)}` : this.apiUrl;
    return this.http.get<CalculationRule[]>(url);
  }

  create(rule: CalculationRule): Observable<CalculationRule> {
    return this.http.post<CalculationRule>(this.apiUrl, rule);
  }

  update(id: number, rule: CalculationRule): Observable<CalculationRule> {
    return this.http.put<CalculationRule>(`${this.apiUrl}/${id}`, rule);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // ------------------------------------------------------------------
  // Cache / chargement
  // ------------------------------------------------------------------

  /** Charge les règles une seule fois (ou force le rechargement) et alimente le cache. */
  loadRules(force = false): Observable<CalculationRule[]> {
    if (!force && (this.loading || this.rulesSubject.value.length > 0)) {
      return this.rules$;
    }
    this.loading = true;
    return this.http.get<CalculationRule[]>(this.apiUrl).pipe(
      tap(rules => this.rulesSubject.next(rules || [])),
      catchError(err => {
        console.warn('[ConfigurationCalcul] Règles non chargées, repli sur les valeurs par défaut', err);
        return of(this.rulesSubject.value);
      }),
      finalize(() => { this.loading = false; })
    );
  }

  getRules(): CalculationRule[] {
    const cached = this.rulesSubject.value;
    return cached.length > 0 ? cached : DEFAULT_RULES;
  }

  getRule(code: string): CalculationRule | undefined {
    return this.getRules().find(r => r.code === code);
  }

  /** Règle active uniquement : une règle désactivée est ignorée (repli sur la valeur par défaut). */
  getActiveRule(code: string): CalculationRule | undefined {
    const rule = this.getRule(code);
    return rule && rule.actif !== false ? rule : undefined;
  }

  isActif(code: string): boolean {
    return !!this.getActiveRule(code);
  }

  /** Liste de valeurs (normalisées : MAJUSCULES, sans accents ni séparateurs) d'une règle LISTE. */
  getList(code: string, fallback: string[] = []): string[] {
    const rule = this.getActiveRule(code);
    const raw = rule && rule.valeurs ? this.parseValues(rule.valeurs) : fallback;
    return raw.map(v => this.normalizeKey(v)).filter(v => v.length > 0);
  }

  /**
   * Liste de valeurs brutes (MAJUSCULES, accents retirés, séparateurs conservés).
   * À utiliser pour les recherches par sous-chaîne (mots-clés).
   */
  getListRaw(code: string, fallback: string[] = []): string[] {
    const rule = this.getActiveRule(code);
    const raw = rule && rule.valeurs ? this.parseValues(rule.valeurs) : fallback;
    return raw
      .map(v => (v || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim())
      .filter(v => v.length > 0);
  }

  /** Valeur numérique d'une règle PARAMETRE. */
  getNumber(code: string, fallback: number): number {
    const rule = this.getActiveRule(code);
    if (rule && rule.type === 'PARAMETRE' && rule.valeur != null) {
      return Number(rule.valeur);
    }
    return fallback;
  }

  /** Évalue une règle FORMULE avec les variables fournies. */
  evaluate(code: string, variables: Record<string, number>, fallback: number): number {
    const rule = this.getActiveRule(code);
    if (!rule || rule.type !== 'FORMULE' || !rule.expression) {
      const def = DEFAULT_BY_CODE[code];
      if (!def || !def.expression) {
        return fallback;
      }
      return this.evaluateTerms(this.parseTerms(def.expression), variables, fallback);
    }
    return this.evaluateTerms(this.parseTerms(rule.expression), variables, fallback);
  }

  evaluateTerms(terms: CalculationFormulaTerm[], variables: Record<string, number>, fallback: number): number {
    if (!terms || terms.length === 0) {
      return fallback;
    }
    return terms.reduce((sum, term) => {
      const dir = term.signe === '-' ? -1 : 1;
      const coef = Number(term.coefficient) || 0;
      let value = Number(variables[term.variable]) || 0;
      if (term.absolue) {
        value = Math.abs(value);
      }
      return sum + dir * coef * value;
    }, 0);
  }

  // ------------------------------------------------------------------
  // Parsing / sérialisation
  // ------------------------------------------------------------------

  parseTerms(expression?: string): CalculationFormulaTerm[] {
    if (!expression) {
      return [];
    }
    try {
      const parsed = JSON.parse(expression);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((t: any) => ({
        signe: t && t.signe === '-' ? '-' : '+',
        coefficient: Number(t && t.coefficient != null ? t.coefficient : 1),
        variable: String(t && t.variable ? t.variable : ''),
        absolue: !!(t && t.absolue)
      }));
    } catch {
      return [];
    }
  }

  serializeTerms(terms: CalculationFormulaTerm[]): string {
    return JSON.stringify(terms || []);
  }

  parseValues(valeurs?: string): string[] {
    if (!valeurs) {
      return [];
    }
    try {
      const parsed = JSON.parse(valeurs);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map(v => String(v));
    } catch {
      return valeurs.split(',').map(v => v.trim()).filter(v => v.length > 0);
    }
  }

  serializeValues(values: string[]): string {
    return JSON.stringify((values || []).map(v => String(v).trim()).filter(v => v.length > 0));
  }

  /** Normalise une clé de correspondance (MAJUSCULES, sans accents ni espaces/underscores/tirets). */
  normalizeKey(value: string): string {
    return (value || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_\-]/g, '');
  }
}

/** Règles par défaut (miroir du seed backend) servant de repli si l'API est indisponible. */
const DEFAULT_RULES: CalculationRule[] = [
  {
    code: 'CERTIF.ECART_MOUVEMENT', module: 'CERTIFICATION_SOLDE', sousModule: 'ECART_MOUVEMENT',
    libelle: 'Écart mouvement', type: 'FORMULE', actif: true, systeme: true,
    expression: JSON.stringify([
      { signe: '+', coefficient: 1, variable: 'VARIATION', absolue: false },
      { signe: '-', coefficient: 1, variable: 'MOUVEMENT_NET_OPPART', absolue: false }
    ])
  },
  {
    code: 'CERTIF.ECART_FRAIS', module: 'CERTIFICATION_SOLDE', sousModule: 'ECART_FRAIS',
    libelle: 'Écart frais', type: 'FORMULE', actif: true, systeme: true,
    expression: JSON.stringify([
      { signe: '+', coefficient: 1, variable: 'FRAIS_ATTENDU', absolue: true },
      { signe: '-', coefficient: 1, variable: 'FRAIS_FACTURE', absolue: true }
    ])
  },
  {
    code: 'CERTIF.ECART_CERTIFICATION', module: 'CERTIFICATION_SOLDE', sousModule: 'ECART_CERTIFICATION',
    libelle: 'Écart de certification (synthèse)', type: 'FORMULE', actif: true, systeme: true,
    expression: JSON.stringify([
      { signe: '+', coefficient: 1, variable: 'ECART_MOUVEMENT', absolue: false },
      { signe: '+', coefficient: 1, variable: 'TOTAL_REGULARISATION', absolue: false }
    ])
  },
  {
    code: 'CERTIF.SOLDE_CLOTURE_THEORIQUE', module: 'CERTIFICATION_SOLDE', sousModule: 'ECART_CERTIFICATION',
    libelle: 'Solde de clôture théorique', type: 'FORMULE', actif: true, systeme: true,
    expression: JSON.stringify([
      { signe: '+', coefficient: 1, variable: 'SOLDE_CLOTURE', absolue: false },
      { signe: '+', coefficient: 1, variable: 'ECART_CERTIFICATION', absolue: false }
    ])
  },
  {
    code: 'CERTIF.TYPES_ECART_PARTENAIRE_RETENUS', module: 'CERTIFICATION_SOLDE', sousModule: 'ECART_PARTENAIRE',
    libelle: 'Types retenus (écart partenaire)', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['IMPACTCOMPTEGENERAL', 'FRAISTRANSACTION', 'VERSEMENTCOMMISSION'])
  },
  {
    code: 'CERTIF.SERVICES_TSOP_NEGATIFS', module: 'CERTIFICATION_SOLDE', sousModule: 'REGULARISATION',
    libelle: 'Services TSOP à signe négatif', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['CASHIN', 'AIRTIME'])
  },
  {
    code: 'CERTIF.TOKENS_COMPENSE', module: 'CERTIFICATION_SOLDE', sousModule: 'REGULARISATION',
    libelle: 'Mots-clés de compensation', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['COMPENS'])
  },
  {
    code: 'CERTIF.TOKENS_TRXSF', module: 'CERTIFICATION_SOLDE', sousModule: 'REGULARISATION',
    libelle: 'Mots-clés TRX SF', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['TRXSF'])
  },
  {
    code: 'CERTIF.TOKENS_RGFRAIS', module: 'CERTIFICATION_SOLDE', sousModule: 'REGULARISATION',
    libelle: 'Mots-clés RGFRAIS / frais', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['RGFRAIS', 'FRAIS'])
  },
  {
    code: 'CERTIF.FRAIS_SIGNE', module: 'CERTIFICATION_SOLDE', sousModule: 'FRAIS',
    libelle: 'Convention de signe des frais', type: 'PARAMETRE', actif: true, systeme: true, valeur: -1
  },
  {
    code: 'CERTIF.TSOP_INCLURE_FRAIS', module: 'CERTIFICATION_SOLDE', sousModule: 'REGULARISATION',
    libelle: 'TSOP : inclure les frais au montant', type: 'PARAMETRE', actif: true, systeme: true, valeur: 1
  },
  {
    code: 'CERTIF.TSOP_INCLURE_COMMISSION', module: 'CERTIFICATION_SOLDE', sousModule: 'REGULARISATION',
    libelle: 'TSOP : inclure la commission au montant', type: 'PARAMETRE', actif: true, systeme: true, valeur: 1
  },
  {
    code: 'CERTIF.COMMISSION_SIGNE', module: 'CERTIFICATION_SOLDE', sousModule: 'REGULARISATION',
    libelle: 'Convention de signe des commissions', type: 'PARAMETRE', actif: true, systeme: true, valeur: 1
  },
  {
    code: 'ECARTSOLDE.FRAIS_SIGNE', module: 'ECART_SOLDE', sousModule: 'FRAIS',
    libelle: 'Convention de signe des frais', type: 'PARAMETRE', actif: true, systeme: true, valeur: -1
  },
  {
    code: 'COMPTES.SEUIL_CRITICITE_TRES', module: 'COMPTES', sousModule: 'CRITICITE',
    libelle: 'Seuil très critique', type: 'PARAMETRE', actif: true, systeme: true, valeur: 0.3
  },
  {
    code: 'COMPTES.SEUIL_CRITICITE_MOYEN', module: 'COMPTES', sousModule: 'CRITICITE',
    libelle: 'Seuil critique', type: 'PARAMETRE', actif: true, systeme: true, valeur: 0.6
  },
  {
    code: 'COMPTES.SEUIL_CRITICITE_FAIBLE', module: 'COMPTES', sousModule: 'CRITICITE',
    libelle: 'Seuil modérément critique', type: 'PARAMETRE', actif: true, systeme: true, valeur: 0.8
  },
  {
    code: 'COLUMNSELECTION.SEUIL_CONFIANCE', module: 'COLUMN_SELECTION', sousModule: 'CONFIANCE',
    libelle: 'Seuil de confiance (suggestions)', type: 'PARAMETRE', actif: true, systeme: true, valeur: 0.7
  },
  {
    code: 'BANQUE.TYPES_APPROVISIONNEMENT', module: 'BANQUE', sousModule: 'CLASSIFICATION',
    libelle: 'Types approvisionnement', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['APPRO'])
  },
  {
    code: 'BANQUE.TYPES_COMPENSATION', module: 'BANQUE', sousModule: 'CLASSIFICATION',
    libelle: 'Types compensation', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['COMPENS', 'COMPENSE'])
  },
  {
    code: 'BANQUE.TYPES_NIVELLEMENT', module: 'BANQUE', sousModule: 'CLASSIFICATION',
    libelle: 'Types nivellement', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['NIVEL', 'NIVELLEMENT'])
  },
  {
    code: 'MODELES.TOKENS_OPPART', module: 'MODELES', sousModule: 'DETECTION_FICHIERS',
    libelle: 'Mots-clés fichier OPPART', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['OPPART'])
  },
  {
    code: 'MODELES.TOKENS_TRXBO', module: 'MODELES', sousModule: 'DETECTION_FICHIERS',
    libelle: 'Mots-clés fichier TRXBO', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['TRXBO'])
  },
  {
    code: 'MODELES.TOKENS_USSDPART', module: 'MODELES', sousModule: 'DETECTION_FICHIERS',
    libelle: 'Mots-clés fichier USSDPART', type: 'LISTE', actif: true, systeme: true,
    valeurs: JSON.stringify(['USSDPART'])
  }
];

const DEFAULT_BY_CODE: Record<string, CalculationRule> = DEFAULT_RULES.reduce(
  (acc, rule) => { acc[rule.code] = rule; return acc; }, {} as Record<string, CalculationRule>
);
