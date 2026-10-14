import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { UserService } from './user.service';

/**
 * Etat partage de la photo de profil de l'utilisateur connecte.
 *
 * La page profil (upload/suppression) et la sidebar (affichage de l'avatar)
 * consomment le meme flux {@link photo$} : toute modification est donc
 * immediatement repercutee partout, sans rechargement.
 *
 * La photo (data URL) est mise en cache dans localStorage, clee sur le
 * username courant, pour un affichage instantane au demarrage et pour eviter
 * de montrer la photo d'un autre utilisateur apres une reconnexion.
 */
@Injectable({ providedIn: 'root' })
export class UserPhotoService {

  private readonly storageKey = 'app_user_photo';

  /** Photo courante (data URL ou null). Initialisee depuis le cache local. */
  readonly photo$ = new BehaviorSubject<string | null>(this.readLocal());

  /** Username pour lequel la photo a deja ete chargee depuis le backend. */
  private loadedFor: string | null = null;

  constructor(
    private userService: UserService
  ) {}

  /**
   * Charge la photo de l'utilisateur courant depuis le backend.
   * Ne fait rien si elle est deja chargee pour ce meme utilisateur,
   * sauf si `force` est vrai.
   */
  load(force = false): void {
    const username = this.currentUsername();
    if (!username) {
      this.setPhoto(null);
      return;
    }
    if (!force && this.loadedFor === username) {
      return;
    }
    this.userService.getMyPhoto().subscribe({
      next: (response) => {
        this.loadedFor = username;
        this.setPhoto(response?.photo ?? null);
      },
      error: () => {
        // Photo facultative : pas d'erreur bloquante, on nettoie juste l'etat.
        this.loadedFor = username;
        this.setPhoto(null);
      }
    });
  }

  /** Met a jour la photo affichee et le cache local. */
  setPhoto(photo: string | null): void {
    this.writeLocal(photo);
    this.photo$.next(photo);
  }

  /** Enregistre une nouvelle photo et propage le nouvel etat. */
  upload(photo: string): Observable<{ message: string; photo: string }> {
    return this.userService.uploadMyPhoto(photo).pipe(
      tap(response => this.setPhoto(response?.photo ?? photo))
    );
  }

  /** Supprime la photo et propage l'etat vide. */
  remove(): Observable<{ message: string }> {
    return this.userService.deleteMyPhoto().pipe(
      tap(() => this.setPhoto(null))
    );
  }

  /** Reinitialise l'etat (a appeler a la deconnexion). */
  clear(): void {
    this.loadedFor = null;
    this.setPhoto(null);
  }

  private currentUsername(): string | null {
    try {
      return localStorage.getItem('username');
    } catch {
      return null;
    }
  }

  private readLocal(): string | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { username?: string; photo?: string };
      if (parsed && parsed.username && parsed.username === this.currentUsername()) {
        return parsed.photo || null;
      }
    } catch {
      // cache illisible : ignore
    }
    return null;
  }

  private writeLocal(photo: string | null): void {
    try {
      const username = this.currentUsername();
      if (photo && username) {
        localStorage.setItem(this.storageKey, JSON.stringify({ username, photo }));
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch {
      // quota localStorage depasse : on garde uniquement l'etat en memoire
    }
  }
}
