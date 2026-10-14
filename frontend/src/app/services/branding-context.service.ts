import { Injectable } from '@angular/core';

/**
 * Resout l'entreprise a mettre en avant AVANT l'authentification, afin
 * d'afficher son logo/theme sur la page de connexion.
 *
 * Deux mecanismes (le premier qui matche gagne) :
 *  1. le sous-domaine : `intouch.monapp.com` -> code `INTOUCH` ;
 *  2. le parametre d'URL : `?entreprise=INTOUCH`.
 *
 * Ne s'applique QU'AVANT connexion : apres authentification, l'entreprise est
 * deduite du jeton de l'utilisateur (et un SUPER_ADMIN garde toujours les
 * couleurs/logo par defaut).
 */
@Injectable({ providedIn: 'root' })
export class BrandingContextService {

  /** Sous-domaines techniques a ne jamais interpreter comme un code entreprise. */
  private readonly reservedSubdomains = new Set([
    'www', 'app', 'api', 'admin', 'localhost', 'ip', 'dev', 'test', 'staging'
  ]);

  /**
   * Code d'entreprise deduit de l'URL courante, ou `null` si aucun
   * (l'application reprend alors ses couleurs/logo par defaut).
   */
  resolveEntrepriseCode(): string | null {
    const fromQuery = this.fromQueryParam();
    if (fromQuery) {
      return fromQuery;
    }
    return this.fromSubdomain();
  }

  private fromQueryParam(): string | null {
    try {
      const value = new URLSearchParams(window.location.search).get('entreprise');
      return value && value.trim() ? value.trim().toUpperCase() : null;
    } catch {
      return null;
    }
  }

  private fromSubdomain(): string | null {
    const host = window.location.hostname;
    if (!host || /^\d+(\.\d+){3}$/.test(host)) {
      return null;
    }
    const labels = host.split('.');
    // Un vrai sous-domaine suppose au moins 3 labels : `intouch.example.com`.
    if (labels.length < 3) {
      return null;
    }
    const sub = labels[0].toLowerCase();
    if (!sub || this.reservedSubdomains.has(sub)) {
      return null;
    }
    return sub.toUpperCase();
  }
}
