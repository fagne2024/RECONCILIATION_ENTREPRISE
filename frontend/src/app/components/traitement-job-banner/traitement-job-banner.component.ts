import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraitementBackgroundService, TraitementBackgroundJob } from '../../services/traitement-background.service';

@Component({
  selector: 'app-traitement-job-banner',
  templateUrl: './traitement-job-banner.component.html',
  styleUrls: ['./traitement-job-banner.component.scss']
})
export class TraitementJobBannerComponent implements OnInit, OnDestroy {
  job: TraitementBackgroundJob | null = null;
  isDownloading = false;
  private subs = new Subscription();

  constructor(
    private service: TraitementBackgroundService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.subs.add(this.service.job$.subscribe(job => {
      this.job = job;
      this.cd.detectChanges();
    }));
    this.subs.add(this.service.isDownloading$.subscribe(d => {
      this.isDownloading = d;
      this.cd.detectChanges();
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  download(): void {
    void this.service.downloadResults();
  }

  clear(): void {
    this.service.clear();
  }
}
