import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/** En dessous de ce volume (JSON sérialisé), la compression n'apporte rien. */
export const GZIP_REQUEST_MIN_CHARS = 256 * 1024;

/**
 * Compresse en gzip les gros corps JSON envoyés à l'API (réconciliation par lots,
 * traitement serveur, imports…). Sans cela, chaque lot de réconciliation envoie des
 * dizaines de Mo de JSON brut : instantané en local, 15-20 s par lot à distance.
 * Le JSON de lignes tabulaires se compresse d'un facteur ~10-20.
 *
 * Le backend décompresse (GzipRequestFilter, en-tête Content-Encoding: gzip).
 * Navigateur sans CompressionStream : envoi non compressé, comme avant.
 */
@Injectable()
export class GzipRequestInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isCandidate(req)) {
      return next.handle(req);
    }
    const json = JSON.stringify(req.body);
    if (json.length < GZIP_REQUEST_MIN_CHARS) {
      return next.handle(req); // petit corps : envoi inchangé
    }
    return from(gzipString(json)).pipe(
      switchMap(compressed => next.handle(req.clone({
        body: compressed,
        setHeaders: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }
      })))
    );
  }

  private isCandidate(req: HttpRequest<any>): boolean {
    if (!supportsGzip()) return false;
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') return false;
    if (req.headers.has('Content-Encoding')) return false;
    const body = req.body;
    if (body === null || body === undefined || typeof body !== 'object') return false;
    // FormData / fichiers / binaires : déjà gérés tels quels (multipart, fichiers compressés).
    if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer
      || ArrayBuffer.isView(body) || body instanceof URLSearchParams) {
      return false;
    }
    const contentType = req.headers.get('Content-Type');
    if (contentType && !contentType.toLowerCase().includes('json')) return false;
    // Uniquement vers notre API (jamais vers un service tiers).
    return req.url.startsWith('/api') || req.url.includes('/api/');
  }
}

export function supportsGzip(): boolean {
  return typeof (globalThis as any).CompressionStream === 'function'
    && typeof Response !== 'undefined'
    && typeof Blob !== 'undefined';
}

/** Compression gzip native du navigateur (hors du thread JS pour l'essentiel). */
export async function gzipString(text: string): Promise<Blob> {
  const CompressionStreamCtor = (globalThis as any).CompressionStream;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStreamCtor('gzip'));
  const compressed = await new Response(stream).blob();
  return new Blob([compressed], { type: 'application/json' });
}
