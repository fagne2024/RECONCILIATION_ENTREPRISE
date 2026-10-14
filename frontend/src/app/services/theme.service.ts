import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface AppTheme {
  primary: string;
  primaryDark: string;
  accent: string;
  info: string;
  infoDark: string;
  sidebarBg: string;
  sidebarHover: string;
  sidebarActive: string;
  contentBg: string;
}

const THEME_VAR_NAMES = [
  '--theme-primary',
  '--theme-primary-dark',
  '--theme-primary-rgb',
  '--theme-accent',
  '--theme-accent-rgb',
  '--theme-info',
  '--theme-info-dark',
  '--theme-info-rgb',
  '--theme-info-dark-rgb',
  '--theme-sidebar-bg',
  '--theme-sidebar-hover',
  '--theme-sidebar-active',
  '--theme-content-bg',
  '--primary-color',
  '--secondary-color',
  '--light-color'
];

const FALLBACK_THEME: AppTheme = {
  primary: '#667eea',
  primaryDark: '#5a6fd6',
  accent: '#764ba2',
  info: '#3498db',
  infoDark: '#2980b9',
  sidebarBg: '#2c3e50',
  sidebarHover: '#34495e',
  sidebarActive: '#3498db',
  contentBg: '#f4f7fa'
};

@Injectable({ providedIn: 'root' })
export class ThemeService {

  private readonly apiUrl = '/api/configuration/theme';
  private readonly storageKey = 'app_theme';

  readonly theme$ = new BehaviorSubject<AppTheme | null>(this.readLocal());

  constructor(private http: HttpClient) {
    const current = this.theme$.value;
    if (current) {
      this.applyCssVars(current);
    }
  }

  /**
   * Charge le thème. `entrepriseCode` (facultatif) cible l'entreprise AVANT
   * authentification (page de connexion). Sans code, l'entreprise est déduite
   * du jeton de l'utilisateur connecté. Si l'entreprise n'a pas de thème, on
   * repasse aux couleurs par défaut (cas SUPER_ADMIN compris).
   */
  init(entrepriseCode?: string | null): void {
    this.http.get<{ theme: AppTheme | null }>(this.buildUrl(entrepriseCode))
      .pipe(catchError(() => of(null)))
      .subscribe(res => {
        if (!res) {
          // Erreur réseau : on conserve l'état courant plutôt que de tout effacer.
          return;
        }
        if (res.theme) {
          const theme = normalizeTheme(res.theme);
          this.writeLocal(theme);
          this.applyCssVars(theme);
          this.theme$.next(theme);
        } else {
          this.useDefaults();
        }
      });
  }

  /** Force les couleurs par défaut de l'application (SUPER_ADMIN, aucune marque). */
  useDefaults(): void {
    this.writeLocal(null);
    this.clearCssVars();
    this.theme$.next(null);
  }

  private buildUrl(entrepriseCode?: string | null): string {
    if (entrepriseCode && entrepriseCode.trim()) {
      return `${this.apiUrl}?entreprise=${encodeURIComponent(entrepriseCode.trim())}`;
    }
    return this.apiUrl;
  }

  applyFromPalette(palette: string[]): AppTheme {
    const theme = deriveTheme(palette);
    this.writeLocal(theme);
    this.applyCssVars(theme);
    this.theme$.next(theme);
    this.http.post(this.apiUrl, { theme })
      .pipe(catchError(() => of(null)))
      .subscribe();
    return theme;
  }

  reset(): void {
    this.writeLocal(null);
    this.clearCssVars();
    this.theme$.next(null);
    this.http.delete(this.apiUrl)
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  private applyCssVars(theme: AppTheme): void {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', theme.primary);
    root.style.setProperty('--theme-primary-dark', theme.primaryDark);
    root.style.setProperty('--theme-primary-rgb', hexToRgb(theme.primary).join(', '));
    root.style.setProperty('--theme-accent', theme.accent);
    root.style.setProperty('--theme-accent-rgb', hexToRgb(theme.accent).join(', '));
    root.style.setProperty('--theme-info', theme.info);
    root.style.setProperty('--theme-info-dark', theme.infoDark);
    root.style.setProperty('--theme-info-rgb', hexToRgb(theme.info).join(', '));
    root.style.setProperty('--theme-info-dark-rgb', hexToRgb(theme.infoDark).join(', '));
    root.style.setProperty('--theme-sidebar-bg', theme.sidebarBg);
    root.style.setProperty('--theme-sidebar-hover', theme.sidebarHover);
    root.style.setProperty('--theme-sidebar-active', theme.sidebarActive);
    root.style.setProperty('--theme-content-bg', theme.contentBg);
    // Variables globales legacy : propagées automatiquement partout où
    // les composants utilisent var(--primary-color) / var(--secondary-color) / var(--light-color)
    root.style.setProperty('--primary-color', theme.primary);
    root.style.setProperty('--secondary-color', theme.accent);
    root.style.setProperty('--light-color', theme.contentBg);
  }

  private clearCssVars(): void {
    const root = document.documentElement;
    for (const name of THEME_VAR_NAMES) {
      root.style.removeProperty(name);
    }
  }

  private readLocal(): AppTheme | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        return normalizeTheme(JSON.parse(raw));
      }
    } catch {
      // ignoré
    }
    return null;
  }

  private writeLocal(theme: AppTheme | null): void {
    try {
      if (theme) {
        localStorage.setItem(this.storageKey, JSON.stringify(theme));
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      // quota localStorage dépassé : on garde juste l'état en mémoire
    }
  }
}

/** Construit un thème complet à partir de la palette extraite du logo. */
export function deriveTheme(palette: string[]): AppTheme {
  const colors = (palette || [])
    .map(normalizeHex)
    .filter((color): color is string => !!color);
  if (!colors.length) {
    return { ...FALLBACK_THEME };
  }

  // Teinte principale : la plus vive, avec une luminosité intermédiaire
  const scored = colors
    .map(color => ({ color, score: saturation(color) * (1 - Math.abs(relativeLum(color) - 0.35)) }))
    .sort((a, b) => b.score - a.score);
  const primary = ensureContrast(scored[0].color, '#FFFFFF', 3.2);
  const primaryDark = mixToward(primary, '#000000', 0.22);

  // Accent : couleur la plus distincte de la primaire, sinon décalage de teinte
  const distinct = colors.find(color =>
    colorDistance(color, primary) > 90 && saturation(color) > 0.18
  );
  const accent = ensureContrast(distinct || shiftHue(primary, 40), '#FFFFFF', 3);

  // Info : la couleur de la palette la plus éloignée de primaire et d'accent,
  // sinon un complémentaire (210°), pour rester distinguable dans l'UI.
  const infoBase = colors.find(color =>
    colorDistance(color, primary) > 120 && colorDistance(color, accent) > 60
  );
  const info = ensureContrast(infoBase || shiftHue(primary, 210), '#FFFFFF', 3);
  const infoDark = mixToward(info, '#000000', 0.2);

  // Fond sidebar : la couleur la plus sombre de la palette, assombrie si nécessaire
  let sidebarBg = colors.reduce(
    (darkest, color) => relativeLum(color) < relativeLum(darkest) ? color : darkest,
    colors[0]
  );
  let guard = 0;
  while (relativeLum(sidebarBg) > 0.12 && guard++ < 40) {
    sidebarBg = mixToward(sidebarBg, '#000000', 0.1);
  }
  const sidebarHover = mixToward(sidebarBg, '#FFFFFF', 0.12);
  const sidebarActive = ensureContrast(primary, '#FFFFFF', 3);

  // Fond de page : teinte très claire de la primaire
  let contentBg = mixToward(primary, '#FFFFFF', 0.94);
  guard = 0;
  while (relativeLum(contentBg) < 0.9 && guard++ < 40) {
    contentBg = mixToward(contentBg, '#FFFFFF', 0.3);
  }

  return { primary, primaryDark, accent, info, infoDark, sidebarBg, sidebarHover, sidebarActive, contentBg };
}

export function normalizeTheme(value: Partial<AppTheme>): AppTheme {
  const theme: AppTheme = { ...FALLBACK_THEME };
  if (!value) {
    return theme;
  }
  const keys: (keyof AppTheme)[] = [
    'primary', 'primaryDark', 'accent', 'info', 'infoDark',
    'sidebarBg', 'sidebarHover', 'sidebarActive', 'contentBg'
  ];
  for (const key of keys) {
    const color = normalizeHex(String(value[key] || ''));
    if (color) {
      theme[key] = color;
    }
  }
  return theme;
}

function normalizeHex(hex: string): string | null {
  if (!hex || typeof hex !== 'string') {
    return null;
  }
  let clean = hex.trim().replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    clean = clean.split('').map(character => character + character).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return null;
  }
  return '#' + clean.toUpperCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = normalizeHex(hex) || '#000000';
  return [
    parseInt(clean.substring(1, 3), 16),
    parseInt(clean.substring(3, 5), 16),
    parseInt(clean.substring(5, 7), 16)
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const part = (value: number) => {
    const clamped = Math.min(255, Math.max(0, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** Mélange a vers b (t = 0 → a, t = 1 → b). */
function mixToward(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** Luminance relative WCAG. */
function relativeLum(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const lumA = relativeLum(a);
  const lumB = relativeLum(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Ajuste la couleur jusqu'à atteindre le contraste minimum demandé. */
function ensureContrast(fg: string, bg: string, min: number): string {
  let color = normalizeHex(fg) || '#000000';
  let guard = 0;
  while (contrast(color, bg) < min && guard++ < 40) {
    color = relativeLum(bg) > 0.5
      ? mixToward(color, '#000000', 0.06)
      : mixToward(color, '#FFFFFF', 0.06);
  }
  return color;
}

function saturation(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) {
    return 0;
  }
  return (max - min) / max;
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Décale la teinte (et réglle saturation/luminosité) pour fabriquer un accent. */
function shiftHue(hex: string, degrees: number): string {
  const [r, g, b] = hexToRgb(hex).map(channel => channel / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }
  const saturationValue = delta === 0 ? 0.5 : delta / (1 - Math.abs(2 * lightness - 1));
  return hslToHex((hue + degrees + 360) % 360, Math.max(saturationValue, 0.45), Math.min(Math.max(lightness, 0.4), 0.6));
}

function hslToHex(h: number, s: number, l: number): string {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  let rgb: [number, number, number];
  if (h < 60) {
    rgb = [chroma, x, 0];
  } else if (h < 120) {
    rgb = [x, chroma, 0];
  } else if (h < 180) {
    rgb = [0, chroma, x];
  } else if (h < 240) {
    rgb = [0, x, chroma];
  } else if (h < 300) {
    rgb = [x, 0, chroma];
  } else {
    rgb = [chroma, 0, x];
  }
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}
