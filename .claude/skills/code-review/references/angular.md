# Checklist — Angular Code Review

## 1. Architecture & Structure

- [ ] Respect de la structure modulaire : `CoreModule`, `SharedModule`, `FeatureModules`
- [ ] Pas de logique métier dans les Composants → déléguer aux Services
- [ ] Composants "dumb" (présentationnels) vs "smart" (containers) bien séparés
- [ ] Lazy loading configuré pour les modules de fonctionnalités
- [ ] Pas d'import circulaire entre modules

## 2. Sécurité

- [ ] **XSS** : pas d'utilisation de `innerHTML` avec des données utilisateur — utiliser `DomSanitizer` si nécessaire
- [ ] **Pas de tokens JWT dans le localStorage** → préférer httpOnly cookies
- [ ] Intercepteurs HTTP pour l'ajout sécurisé des headers d'authentification
- [ ] Guards sur les routes protégées (`canActivate`, `canLoad`)
- [ ] Validation côté client ET côté serveur (jamais uniquement côté client)
- [ ] Pas de données sensibles dans les URL (query params visibles dans les logs)
- [ ] `Content-Security-Policy` configurée si possible

## 3. Gestion des Observables & RxJS

- [ ] **Pas de fuite mémoire** : `subscribe()` accompagné de `takeUntilDestroyed()`, `AsyncPipe`, ou `unsubscribe()` dans `ngOnDestroy`
- [ ] Préférer `AsyncPipe` dans les templates plutôt que `subscribe()` dans le composant
- [ ] Opérateurs RxJS appropriés : `switchMap` (annule la précédente), `mergeMap` (parallèle), `concatMap` (séquentiel)
- [ ] Pas de `subscribe()` imbriqués → utiliser `pipe()` avec les bons opérateurs
- [ ] Gestion des erreurs dans les observables (`catchError`, `retry`)
- [ ] `shareReplay(1)` sur les observables partagés pour éviter les appels multiples

## 4. Performance

- [ ] `OnPush` Change Detection sur les composants présentationnels
- [ ] `TrackBy` sur les `*ngFor` pour les listes dynamiques
- [ ] Images optimisées (lazy loading natif, `NgOptimizedImage`)
- [ ] Pas d'appels HTTP dans `ngOnChanges` ou dans des boucles
- [ ] Bundle size : vérifier les imports (éviter d'importer tout un module pour une seule fonction)
- [ ] Signals utilisés si Angular 17+ (réactivité plus performante)

## 5. Qualité du code

- [ ] Types TypeScript stricts (pas de `any` sauf cas exceptionnel justifié)
- [ ] Interfaces/Types définis pour les modèles de données
- [ ] Formulaires : `ReactiveFormsModule` préféré à `FormsModule` pour les formulaires complexes
- [ ] Pas de logique dans les templates (conditions complexes → méthodes ou getters)
- [ ] Sélecteurs CSS scopés (pas de styles globaux dans les composants)
- [ ] `@Input()` et `@Output()` correctement typés

## 6. Tests

- [ ] Tests unitaires avec Jest ou Jasmine + `TestBed`
- [ ] Mocks des services injectés (`HttpClientTestingModule`, `jasmine.createSpyObj`)
- [ ] Tests des cas d'erreur et états de chargement
- [ ] Tests des Guards et Intercepteurs
- [ ] Tests E2E avec Cypress ou Playwright pour les parcours critiques

## 7. Bonnes pratiques Angular

- [ ] `standalone: true` utilisé si Angular 14+ (évite les NgModules inutiles)
- [ ] Environnements configurés (`environment.ts` / `environment.prod.ts`)
- [ ] Pas de `console.log` laissés en production
- [ ] Gestion de l'état : NgRx, Signals Store, ou service avec `BehaviorSubject` selon la complexité
- [ ] `HttpClient` utilisé (pas `fetch` natif) pour bénéficier des intercepteurs

## Exemples de problèmes courants

### ❌ Mauvais : fuite mémoire + any + logique dans template
```typescript
@Component({
  template: `
    <div *ngFor="let item of items">
      <span *ngIf="item.status === 'active' && item.role !== 'guest' && !item.deleted">
        {{ item.name }}
      </span>
    </div>
  `
})
export class BadComponent implements OnInit {
  items: any[] = [];

  ngOnInit() {
    this.dataService.getItems().subscribe(data => { // fuite mémoire !
      this.items = data;
    });
  }
}
```

### ✅ Bon
```typescript
interface Item {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  role: string;
  deleted: boolean;
}

@Component({
  template: `
    <div *ngFor="let item of items$ | async; trackBy: trackById">
      <span *ngIf="isVisible(item)">{{ item.name }}</span>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GoodComponent {
  items$ = this.dataService.getItems().pipe(
    catchError(() => EMPTY)
  );

  trackById = (index: number, item: Item) => item.id;

  isVisible = (item: Item): boolean =>
    item.status === 'active' && item.role !== 'guest' && !item.deleted;

  constructor(private dataService: DataService) {}
}
```
