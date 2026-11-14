import { ErrorHandler, Injectable } from '@angular/core';

const RELOAD_KEY = 'chunkLoadErrorReloadAt';
/** Pas plus d'un rechargement automatique par minute (évite toute boucle). */
const RELOAD_MIN_INTERVAL_MS = 60_000;

/** Vrai pour l'échec de chargement d'un écran chargé à la demande (loadComponent). */
export function isChunkLoadError(error: any): boolean {
  const err = error?.rejection ?? error;
  const name = String(err?.name ?? '');
  const message = String(err?.message ?? error?.message ?? '');
  return name === 'ChunkLoadError' || /Loading chunk [\w-]+ failed/i.test(message);
}

/**
 * Après un déploiement, un onglet resté ouvert exécute l'ancienne version : ses écrans
 * chargés à la demande pointent vers des fichiers (nom avec empreinte) qui n'existent plus
 * → 404 / ChunkLoadError et page bloquée. On recharge alors la page une fois pour
 * récupérer la version courante (le serveur répond index.html en no-cache).
 */
@Injectable()
export class ChunkLoadErrorHandler implements ErrorHandler {

  handleError(error: any): void {
    if (isChunkLoadError(error) && this.reloadAllowed()) {
      console.warn('[app] Nouvelle version déployée : rechargement de la page.', error);
      window.location.reload();
      return;
    }
    console.error(error);
  }

  private reloadAllowed(): boolean {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      const now = Date.now();
      if (now - last < RELOAD_MIN_INTERVAL_MS) {
        return false;
      }
      sessionStorage.setItem(RELOAD_KEY, String(now));
      return true;
    } catch {
      // Stockage indisponible : pas de rechargement automatique (pas de garde anti-boucle).
      return false;
    }
  }
}
