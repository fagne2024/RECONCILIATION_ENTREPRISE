import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  LogoService,
  LogoSettings,
  DEFAULT_LOGO_SETTINGS,
  logoSettingsStyle,
  logoPaddingStyle
} from '../../services/logo.service';
import { PopupService } from '../../services/popup.service';
import { ThemeService } from '../../services/theme.service';
import { I18nService } from '../../services/i18n/i18n.service';

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 Mo
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|jfif|gif|bmp|svg|webp|ico|tiff?|avif|heic|heif)$/i;
const MAX_PALETTE_COLORS = 6;

@Component({
  selector: 'app-configuration-logo',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './configuration-logo.component.html',
  styleUrls: ['./configuration-logo.component.scss']
})
export class ConfigurationLogoComponent implements OnInit, OnDestroy {

  logoUrl: string | null = null;
  pendingLogo: string | null = null;

  settings: LogoSettings = { ...DEFAULT_LOGO_SETTINGS };
  savedSettings: LogoSettings = { ...DEFAULT_LOGO_SETTINGS };

  palette: string[] = [];
  paletteError = false;
  copiedHex: string | null = null;
  themeActive = false;

  private destroy$ = new Subject<void>();
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private logoService: LogoService,
    private popupService: PopupService,
    private themeService: ThemeService
  ) { }

  ngOnInit(): void {
    this.logoService.logo$.pipe(takeUntil(this.destroy$)).subscribe(url => {
      this.logoUrl = url;
      if (!this.pendingLogo) {
        this.refreshPalette(url);
      }
    });
    this.logoService.settings$.pipe(takeUntil(this.destroy$)).subscribe(settings => {
      this.settings = { ...settings };
      this.savedSettings = { ...settings };
    });
    this.themeService.theme$.pipe(takeUntil(this.destroy$)).subscribe(theme => {
      this.themeActive = !!theme;
    });
    this.logoService.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
    }
  }

  get displayLogo(): string | null {
    return this.pendingLogo || this.logoUrl;
  }

  get settingsDirty(): boolean {
    return JSON.stringify(this.settings) !== JSON.stringify(this.savedSettings);
  }

  get hasPendingChanges(): boolean {
    return !!this.pendingLogo || this.settingsDirty;
  }

  get previewStyle(): { [key: string]: string } {
    return logoSettingsStyle(this.settings);
  }

  get paddingStyle(): { [key: string]: string } {
    return logoPaddingStyle(this.settings);
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!this.isImageFile(file)) {
      this.popupService.showError(this.t('CFG.logo.invalidType'));
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      this.popupService.showError(this.t('CFG.logo.tooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.pendingLogo = String(reader.result || '');
      this.refreshPalette(this.pendingLogo);
    };
    reader.readAsDataURL(file);
  }

  saveLogo(): void {
    if (!this.hasPendingChanges) {
      return;
    }
    const logoChanged = !!this.pendingLogo;
    const logoToSave = this.pendingLogo !== null ? this.pendingLogo : undefined;
    const settingsToSave = this.settingsDirty ? this.settings : undefined;
    this.logoService.save(logoToSave, settingsToSave).subscribe(() => {
      this.pendingLogo = null;
      this.savedSettings = { ...this.settings };
      this.popupService.showSuccess(this.t(logoChanged ? 'CFG.logo.saved' : 'CFG.logo.settingsSaved'));
    });
  }

  async removeLogo(): Promise<void> {
    const confirmed = await this.popupService.showConfirm(
      this.t('CFG.logo.removeConfirm'),
      this.t('CFG.logo.remove')
    );
    if (!confirmed) {
      return;
    }
    this.pendingLogo = null;
    this.logoService.clear();
    this.refreshPalette(null);
    // Le logo est la source d'inspiration du design : sa suppression ramène les couleurs par défaut
    this.themeService.reset();
    this.popupService.showSuccess(this.t('CFG.logo.removed'));
  }

  applyDesign(): void {
    if (!this.palette.length) {
      this.popupService.showError(this.t('CFG.logo.paletteRequired'));
      return;
    }
    this.themeService.applyFromPalette(this.palette);
    this.popupService.showSuccess(this.t('CFG.logo.designApplied'));
  }

  async resetDesign(): Promise<void> {
    const confirmed = await this.popupService.showConfirm(
      this.t('CFG.logo.resetConfirm'),
      this.t('CFG.logo.resetDesign')
    );
    if (!confirmed) {
      return;
    }
    this.themeService.reset();
    this.popupService.showSuccess(this.t('CFG.logo.designReset'));
  }

  copyColor(hex: string): void {
    const done = () => {
      this.copiedHex = hex;
      if (this.copiedTimer) {
        clearTimeout(this.copiedTimer);
      }
      this.copiedTimer = setTimeout(() => {
        this.copiedHex = null;
        this.copiedTimer = null;
      }, 2500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(hex).then(done, () => this.fallbackCopy(hex, done));
    } else {
      this.fallbackCopy(hex, done);
    }
  }

  swatchTextColor(hex: string): string {
    const r = parseInt(hex.substring(1, 3), 16);
    const g = parseInt(hex.substring(3, 5), 16);
    const b = parseInt(hex.substring(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#1a1714' : '#ffffff';
  }

  private fallbackCopy(text: string, done: () => void): void {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      done();
    } catch {
      // copie impossible
    }
  }

  /** Extrait les couleurs dominantes d'un logo (canvas + quantification). */
  private refreshPalette(dataUrl: string | null): void {
    this.palette = [];
    this.paletteError = false;
    this.copiedHex = null;
    if (!dataUrl) {
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
        if (!context || !image.width || !image.height) {
          this.paletteError = true;
          return;
        }
        const ratio = Math.min(1, 100 / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

        const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] < 128) {
            continue;
          }
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          if (r > 242 && g > 242 && b > 242) {
            continue;
          }
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
          bucket.n++;
          buckets.set(key, bucket);
        }

        const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
        const picked: { r: number; g: number; b: number }[] = [];
        for (const bucket of sorted) {
          const color = {
            r: Math.round(bucket.r / bucket.n),
            g: Math.round(bucket.g / bucket.n),
            b: Math.round(bucket.b / bucket.n)
          };
          if (picked.some(existing => this.colorDistance(existing, color) < 45)) {
            continue;
          }
          picked.push(color);
          if (picked.length >= MAX_PALETTE_COLORS) {
            break;
          }
        }
        this.palette = picked.map(color => this.toHex(color));
      } catch {
        this.paletteError = true;
      }
    };
    image.onerror = () => {
      this.paletteError = true;
    };
    image.src = dataUrl;
  }

  private colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
    return Math.sqrt(
      (a.r - b.r) * (a.r - b.r) +
      (a.g - b.g) * (a.g - b.g) +
      (a.b - b.b) * (a.b - b.b)
    );
  }

  private toHex(color: { r: number; g: number; b: number }): string {
    const part = (value: number) => value.toString(16).padStart(2, '0');
    return `#${part(color.r)}${part(color.g)}${part(color.b)}`.toUpperCase();
  }

  private isImageFile(file: File): boolean {
    if (file.type) {
      return file.type.startsWith('image/');
    }
    return IMAGE_EXTENSION_PATTERN.test(file.name);
  }

  private t(key: string): string {
    return I18nService.t(key);
  }
}
