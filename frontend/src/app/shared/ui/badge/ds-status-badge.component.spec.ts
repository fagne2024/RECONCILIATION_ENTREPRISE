import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DsStatusBadgeComponent } from './ds-status-badge.component';

describe('DsStatusBadgeComponent', () => {
  let fixture: ComponentFixture<DsStatusBadgeComponent>;
  let component: DsStatusBadgeComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DsStatusBadgeComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(DsStatusBadgeComponent);
    component = fixture.componentInstance;
  });

  it('affiche le libellé du statut, pas seulement une couleur', () => {
    component.status = 'matched';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Rapproché');
  });

  it('accepte un libellé fourni par la page', () => {
    component.status = 'done';
    component.label = 'OK';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('OK');
    expect(fixture.nativeElement.textContent).not.toContain('Traité');
  });
});
