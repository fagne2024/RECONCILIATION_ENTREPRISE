import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { UserLog, UserLogFilter } from '../../models/user-log.model';
import { UserLogService } from '../../services/user-log.service';
import { PopupService } from '../../services/popup.service';
import { I18nService } from '../../services/i18n/i18n.service';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

const USER_COLORS = ['#185FA5', '#3B8A5A', '#8C6A1E', '#7A3A8C', '#1A7A8C', '#C87040', '#4A82C4', '#8B2635'];

/**
 * Libellés affichés des modules du journal.
 *
 * Les clés de `modColors` / `modClass` restent les identifiants techniques
 * renvoyés par le backend : seule l'étiquette présentée à l'utilisateur passe
 * par i18n, afin que le basculement FR/EN suive le changement de langue.
 */
const MODULE_LABEL_KEYS: Record<string, string> = {
  Navigation: 'ULG.modules.navigation',
  'Réconciliation': 'ULG.modules.reconciliation',
  'Impact OP': 'ULG.modules.impactOp',
  'Opérations': 'ULG.modules.operations',
  'Authentification': 'ULG.modules.authentication',
  'Profil': 'ULG.modules.profil',
  'Utilisateur': 'ULG.modules.user',
  'Résultats': 'ULG.modules.results',
  'Statistiques': 'ULG.modules.statistics',
  'Frais & Com.': 'ULG.modules.feesCommission',
  'Frais': 'ULG.modules.fees',
  'Commission': 'ULG.modules.commission',
  'Charge': 'ULG.modules.charge',
  'Banque': 'ULG.modules.bank',
  'BANQUE': 'ULG.modules.bank',
  'Comptes': 'ULG.modules.accounts',
  'Comptabilité': 'ULG.modules.accounting',
  'Modèles': 'ULG.modules.models',
  'Paramètre': 'ULG.modules.settings',
  'Log utilisateur': 'ULG.modules.userLog',
  'Dashboard': 'ULG.modules.dashboard',
  'Traitement': 'ULG.modules.processing',
  'Classements': 'ULG.modules.rankings',
  'TSOP': 'ULG.modules.tsop',
  'OPPART': 'ULG.modules.oppart',
  'TRX SF': 'ULG.modules.trxSf',
  'AIDE': 'ULG.modules.aide',
  'Module': 'ULG.modules.module',
  'Permission': 'ULG.modules.permissionModule'
};

export interface DashboardUserAgg {
  name: string;
  role: string;
  color: string;
  initials: string;
  online: boolean;
  total: number;
  sessions: number;
  lastSeen: string;
  modules: Record<string, number>;
}

@Component({
  selector: 'app-user-log',
  templateUrl: './user-log.component.html',
  styleUrls: ['./user-log.component.scss']
})
export class UserLogComponent implements OnInit {
  logs: UserLog[] = [];
  filteredLogs: UserLog[] = [];
  isLoading = false;
  currentPage = 1;
  pageSize = 20;
  totalPages = 1;
  showAllLogs = false;

  activeView: 'logs' | 'dashboard' = 'logs';

  filterForm: FormGroup;
  usernames: string[] = [];
  modules: string[] = [];
  permissions: string[] = [];

  /** Agrégations pour le dashboard (recalculées au chargement des logs + filtres dashboard) */
  dashboardUsers: DashboardUserAgg[] = [];
  /** Nombre de logs après filtres dashboard (KPI / sous-titre) */
  dashboardLogCount = 0;
  heatmapModules: string[] = [];

  trackByIndex = (index: number): number => index;

  trackByValue = (index: number, value: any): any => value;

  trackByName = (index: number, item: { name?: string }): string => item?.name ?? String(index);
  heatmapMaxCell = 0;
  topModuleName = '—';
  topModuleTotal = 0;
  lastActivityShort = '—';
  lastActivityUser = '—';
  /** Timeline complète (triée, avant pagination) */
  timelineLogsAll: UserLog[] = [];

  /** Filtres additionnels uniquement sur le dashboard (sous-ensemble des logs chargés) */
  dashboardFilterForm: FormGroup;

  dashUsersPage = 1;
  dashUsersPageSize = 6;
  dashTimelinePage = 1;
  dashTimelinePageSize = 10;

  readonly modColors: Record<string, string> = {
    Navigation: '#4A82C4',
    Réconciliation: '#4A9E6A',
    'Impact OP': '#7A70C8',
    Opérations: '#3A98A0',
    Authentification: '#C8783C',
    Profil: '#3A98A0',
    Utilisateur: '#C4566A',
    Résultats: '#5A9E74',
    Statistiques: '#C87040',
    'Frais & Com.': '#185FA5',
    Banque: '#8C4E1A',
    Comptes: '#4A6EA0',
    Paramètre: '#8C3A4E',
    'Log utilisateur': '#7A70C8'
  };

  /** Identifiant de module (backend) -> clé de traduction de son libellé affiché. */
  readonly moduleLabelKeyByName: Record<string, string> = Object.entries(MODULE_LABEL_KEYS).reduce(
    (acc, [name, key]) => {
      acc[name.toLowerCase()] = key;
      return acc;
    },
    {} as Record<string, string>
  );

  constructor(
    private userLogService: UserLogService,
    private popup: PopupService,
    private fb: FormBuilder
  ) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    this.filterForm = this.fb.group({
      username: [''],
      module: [''],
      permission: [''],
      dateDebut: [this.formatDateForInput(firstDayOfMonth)],
      dateFin: [this.formatDateForInput(now)]
    });

    this.dashboardFilterForm = this.fb.group({
      searchUser: [''],
      dashModule: [''],
      dashPermission: [''],
      minActions: ['']
    });
  }

  ngOnInit(): void {
    this.loadLogs();

    this.filterForm.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
      )
      .subscribe((values) => {
        if (!values.dateDebut && !values.dateFin) {
          this.showAllLogs = true;
        } else {
          const now = new Date();
          const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const expectedDateDebut = this.formatDateForInput(firstDayOfMonth);
          const expectedDateFin = this.formatDateForInput(now);

          if (values.dateDebut === expectedDateDebut && values.dateFin === expectedDateFin) {
            this.showAllLogs = false;
          }
        }

        this.currentPage = 1;
        this.loadLogs();
      });
  }

  goto(view: 'logs' | 'dashboard'): void {
    this.activeView = view;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  loadLogs(): void {
    this.isLoading = true;

    const filter: UserLogFilter = {};
    if (this.filterForm.value.username) {
      filter.username = this.filterForm.value.username;
    }
    if (this.filterForm.value.module) {
      filter.module = this.filterForm.value.module;
    }
    if (this.filterForm.value.permission) {
      filter.permission = this.filterForm.value.permission;
    }
    if (this.filterForm.value.dateDebut) {
      filter.dateDebut = this.filterForm.value.dateDebut;
    }
    if (this.filterForm.value.dateFin) {
      filter.dateFin = this.filterForm.value.dateFin;
    }

    this.userLogService.getLogs(filter).subscribe({
      next: (logs) => {
        this.logs = logs;
        this.filteredLogs = logs;
        this.updatePagination();
        this.extractUniqueValues();
        this.rebuildDashboardAggregates();
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des logs:', error);
        this.isLoading = false;
        this.popup.showError(
          error?.error?.message || error?.error?.error || I18nService.t('ULG.loadError')
        );
      }
    });
  }

  applyFilters(): void {
    this.currentPage = 1;
    this.loadLogs();
  }

  resetFilters(): void {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    this.filterForm.reset({
      username: '',
      module: '',
      permission: '',
      dateDebut: this.formatDateForInput(firstDayOfMonth),
      dateFin: this.formatDateForInput(now)
    });
    this.showAllLogs = false;
    this.currentPage = 1;
    this.loadLogs();
  }

  toggleShowAllLogs(): void {
    this.showAllLogs = !this.showAllLogs;

    if (this.showAllLogs) {
      this.filterForm.patchValue({
        dateDebut: '',
        dateFin: ''
      });
    } else {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      this.filterForm.patchValue({
        dateDebut: this.formatDateForInput(firstDayOfMonth),
        dateFin: this.formatDateForInput(now)
      });
    }

    this.currentPage = 1;
    this.loadLogs();
  }

  extractUniqueValues(): void {
    this.usernames = [...new Set(this.logs.map((log) => log.username))].sort();
    this.modules = [...new Set(this.logs.map((log) => log.module))].sort();
    this.permissions = [...new Set(this.logs.map((log) => log.permission))].sort();
  }

  /** Filtres texte / seuil sur le jeu déjà chargé (complément des filtres API de l’onglet Logs) */
  applyDashboardFilters(): void {
    this.dashUsersPage = 1;
    this.dashTimelinePage = 1;
    this.rebuildDashboardAggregates();
  }

  resetDashboardFilters(): void {
    this.dashboardFilterForm.reset({
      searchUser: '',
      dashModule: '',
      dashPermission: '',
      minActions: ''
    });
    this.dashUsersPage = 1;
    this.dashTimelinePage = 1;
    this.rebuildDashboardAggregates();
  }

  private applyDashboardLogFilters(logs: UserLog[]): UserLog[] {
    const v = this.dashboardFilterForm?.value ?? {};
    let out = logs;
    const su = String(v.searchUser || '')
      .trim()
      .toLowerCase();
    if (su) {
      out = out.filter((l) => (l.username || '').toLowerCase().includes(su));
    }
    const dm = String(v.dashModule || '')
      .trim()
      .toLowerCase();
    if (dm) {
      out = out.filter((l) => (l.module || '').toLowerCase().includes(dm));
    }
    const dp = String(v.dashPermission || '')
      .trim()
      .toLowerCase();
    if (dp) {
      out = out.filter((l) => (l.permission || '').toLowerCase().includes(dp));
    }
    return out;
  }

  private computeDashboardFromLogs(logs: UserLog[]): void {
    this.dashboardLogCount = logs.length;
    const byUser = new Map<
      string,
      { modules: Record<string, number>; days: Set<string> }
    >();
    const moduleTotals = new Map<string, number>();

    for (const log of logs) {
      const u = log.username || '—';
      if (!byUser.has(u)) {
        byUser.set(u, { modules: {}, days: new Set<string>() });
      }
      const entry = byUser.get(u)!;
      const mod = log.module || '—';
      entry.modules[mod] = (entry.modules[mod] || 0) + 1;
      const d = new Date(log.dateHeure);
      if (!isNaN(d.getTime())) {
        entry.days.add(d.toISOString().slice(0, 10));
      }
      moduleTotals.set(mod, (moduleTotals.get(mod) || 0) + 1);
    }

    let bestMod = '—';
    let bestModCount = 0;
    moduleTotals.forEach((c, m) => {
      if (c > bestModCount) {
        bestModCount = c;
        bestMod = m;
      }
    });
    this.topModuleName = bestMod;
    this.topModuleTotal = bestModCount;

    let latest: UserLog | null = null;
    let latestTs = 0;
    for (const log of logs) {
      const t = new Date(log.dateHeure).getTime();
      if (!isNaN(t) && t >= latestTs) {
        latestTs = t;
        latest = log;
      }
    }
    if (latest) {
      this.lastActivityUser = latest.username;
      this.lastActivityShort = this.formatDateShort(latest.dateHeure);
    } else {
      this.lastActivityUser = '—';
      this.lastActivityShort = '—';
    }

    const users: DashboardUserAgg[] = [];
    let idx = 0;
    byUser.forEach((data, name) => {
      const total = Object.values(data.modules).reduce((a, b) => a + b, 0);
      let lastSeen = '—';
      let lastTs = 0;
      for (const log of logs) {
        if (log.username !== name) continue;
        const t = new Date(log.dateHeure).getTime();
        if (!isNaN(t) && t >= lastTs) {
          lastTs = t;
          lastSeen = this.formatDate(log.dateHeure);
        }
      }
      users.push({
        name,
        role: I18nService.t('ULG.accountRole'),
        color: USER_COLORS[idx % USER_COLORS.length],
        initials: this.getUserInitials(name),
        online: false,
        total,
        sessions: data.days.size || 1,
        lastSeen,
        modules: { ...data.modules }
      });
      idx++;
    });
    users.sort((a, b) => b.total - a.total);
    this.dashboardUsers = users;

    const modKeys = [...moduleTotals.keys()].sort(
      (a, b) => (moduleTotals.get(b) || 0) - (moduleTotals.get(a) || 0)
    );
    this.heatmapModules = modKeys.slice(0, 8);

    this.heatmapMaxCell = 0;
    for (const u of users) {
      for (const m of this.heatmapModules) {
        const v = u.modules[m] || 0;
        if (v > this.heatmapMaxCell) this.heatmapMaxCell = v;
      }
    }
    if (this.heatmapMaxCell === 0) this.heatmapMaxCell = 1;

    this.timelineLogsAll = [...logs].sort(
      (a, b) => new Date(b.dateHeure).getTime() - new Date(a.dateHeure).getTime()
    );
  }

  private rebuildDashboardAggregates(): void {
    let logs = this.applyDashboardLogFilters([...this.filteredLogs]);
    this.computeDashboardFromLogs(logs);

    const minRaw = this.dashboardFilterForm?.value?.minActions;
    const minA = minRaw === '' || minRaw == null ? 0 : Number(minRaw);
    if (!isNaN(minA) && minA > 0) {
      const keep = new Set(
        this.dashboardUsers.filter((u) => u.total >= minA).map((u) => u.name)
      );
      logs = logs.filter((l) => keep.has(l.username || '—'));
      this.computeDashboardFromLogs(logs);
    }

    this.clampDashPagination();
  }

  private clampDashPagination(): void {
    const up = Math.max(1, Math.ceil(this.dashboardUsers.length / this.dashUsersPageSize) || 1);
    if (this.dashUsersPage > up) this.dashUsersPage = up;
    if (this.dashUsersPage < 1) this.dashUsersPage = 1;

    const tp = Math.max(1, Math.ceil(this.timelineLogsAll.length / this.dashTimelinePageSize) || 1);
    if (this.dashTimelinePage > tp) this.dashTimelinePage = tp;
    if (this.dashTimelinePage < 1) this.dashTimelinePage = 1;
  }

  get pagedDashboardUsers(): DashboardUserAgg[] {
    const s = (this.dashUsersPage - 1) * this.dashUsersPageSize;
    return this.dashboardUsers.slice(s, s + this.dashUsersPageSize);
  }

  get pagedTimelineLogs(): UserLog[] {
    const s = (this.dashTimelinePage - 1) * this.dashTimelinePageSize;
    return this.timelineLogsAll.slice(s, s + this.dashTimelinePageSize);
  }

  get dashUsersTotalPages(): number {
    return Math.max(1, Math.ceil(this.dashboardUsers.length / this.dashUsersPageSize) || 1);
  }

  get dashTimelineTotalPages(): number {
    return Math.max(1, Math.ceil(this.timelineLogsAll.length / this.dashTimelinePageSize) || 1);
  }

  prevDashUsersPage(): void {
    if (this.dashUsersPage > 1) this.dashUsersPage--;
  }

  nextDashUsersPage(): void {
    if (this.dashUsersPage < this.dashUsersTotalPages) this.dashUsersPage++;
  }

  prevDashTimelinePage(): void {
    if (this.dashTimelinePage > 1) this.dashTimelinePage--;
  }

  nextDashTimelinePage(): void {
    if (this.dashTimelinePage < this.dashTimelineTotalPages) this.dashTimelinePage++;
  }

  heatmapCellOpacity(count: number): number {
    if (count === 0) return 1;
    const alpha = count / this.heatmapMaxCell;
    return 0.15 + alpha * 0.85;
  }

  heatmapCellBackground(mod: string, count: number): string {
    if (count === 0) return 'var(--border)';
    return this.modColors[mod] || '#4A82C4';
  }

  get periodLabel(): string {
    const d0 = this.filterForm?.value?.dateDebut;
    const d1 = this.filterForm?.value?.dateFin;
    if (!d0 || !d1) {
      return I18nService.t('ULG.allPeriods');
    }
    try {
      const a = new Date(d0);
      const b = new Date(d1);
      const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
      const lang = I18nService.currentLanguage;
      const fa = a.toLocaleDateString(lang, options);
      const fb = b.toLocaleDateString(lang, options);
      return `${fa} → ${fb}`;
    } catch {
      return '';
    }
  }

  /** Libellé traduit d'un module, à partir de son identifiant backend. */
  moduleLabel(moduleName: string): string {
    const raw = (moduleName || '').trim();
    if (!raw || raw === '—') {
      return raw || '—';
    }
    const key = this.moduleLabelKeyByName[raw.toLowerCase()];
    return key ? I18nService.t(key) : raw;
  }

  formatCount(n: number): string {
    return (n || 0).toLocaleString(I18nService.currentLanguage);
  }

  formatCompact(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  modClass(m: string): string {
    const map: Record<string, string> = {
      Navigation: 'mod-nav',
      Réconciliation: 'mod-rec',
      Authentification: 'mod-auth',
      'Impact OP': 'mod-op',
      'Log utilisateur': 'mod-op',
      Profil: 'mod-profil',
      Utilisateur: 'mod-user'
    };
    return map[m] || 'mod-default';
  }

  getUserInitials(username: string): string {
    if (!username) return '?';
    return username
      .split('.')
      .map((p) => (p[0] || '').toUpperCase())
      .join('')
      .slice(0, 2);
  }

  userShortName(username: string): string {
    const p = (username || '').split('.')[0];
    return p || username || '—';
  }

  topModulesForUser(u: DashboardUserAgg, limit: number): { name: string; count: number }[] {
    return Object.entries(u.modules)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  topModuleMax(entries: { name: string; count: number }[]): number {
    return entries[0]?.count || 1;
  }

  barPct(count: number, max: number): number {
    if (!max) return 0;
    return Math.round((count / max) * 100);
  }

  moduleKeysCount(mods: Record<string, number>): number {
    return Object.keys(mods || {}).length;
  }

  userColor(username: string): string {
    const c = this.dashboardUsers.find((x) => x.name === username)?.color;
    if (c) return c;
    return USER_COLORS[Math.abs(this.hashString(username || '')) % USER_COLORS.length];
  }

  private hashString(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.filteredLogs.length / this.pageSize);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
  }

  get pagedLogs(): UserLog[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredLogs.slice(start, end);
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString(I18nService.currentLanguage, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  formatDateShort(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString(I18nService.currentLanguage, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
}
