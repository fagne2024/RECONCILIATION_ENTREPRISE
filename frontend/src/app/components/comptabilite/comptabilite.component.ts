import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { SharedUiModule } from '../../shared/shared-ui.module';

@Component({
  selector: 'app-comptabilite',
  standalone: true,
  imports: [SharedUiModule, TranslateModule],
  templateUrl: './comptabilite.component.html',
  styleUrls: ['./comptabilite.component.scss']
})
export class ComptabiliteComponent {
}


