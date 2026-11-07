import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';

/**
 * Envoie un formulaire multipart et remonte le pourcentage d'envoi (octets envoyés / total).
 * La promesse se résout avec le corps de la réponse du serveur.
 */
export function postFormWithProgress<T>(
  http: HttpClient,
  url: string,
  form: FormData,
  onProgress?: (percent: number) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const req = new HttpRequest('POST', url, form, { reportProgress: true });
    http.request(req).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          onProgress?.(Math.round((100 * event.loaded) / event.total));
        } else if (event.type === HttpEventType.Response) {
          resolve(event.body as T);
        }
      },
      error: err => reject(err)
    });
  });
}
