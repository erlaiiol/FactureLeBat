import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { TourService } from './shared/tour/tour.service';
import { TourOverlayComponent } from './shared/tour/tour-overlay.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TourOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly tourService = inject(TourService);

  protected toggleTour(): void {
    this.tourService.setTourEnabled(!this.tourService.tourEnabled());
  }
}
