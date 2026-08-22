import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LegalStatus } from '../models/company.model';
import { LegalStatusConfirmation, OnboardingState, TourId } from '../models/onboarding.model';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/onboarding`;

  getState(): Observable<OnboardingState> {
    return this.http.get<OnboardingState>(this.baseUrl);
  }

  setTourEnabled(tourEnabled: boolean): Observable<OnboardingState> {
    return this.http.patch<OnboardingState>(this.baseUrl, { tourEnabled });
  }

  completeTour(tourId: TourId): Observable<OnboardingState> {
    return this.http.post<OnboardingState>(`${this.baseUrl}/tours/${tourId}/complete`, {});
  }

  resetTours(): Observable<OnboardingState> {
    return this.http.post<OnboardingState>(`${this.baseUrl}/reset`, {});
  }

  confirmLegalStatus(
    legalStatus: LegalStatus,
    vatRateBasisPoints?: number,
  ): Observable<LegalStatusConfirmation> {
    return this.http.post<LegalStatusConfirmation>(`${this.baseUrl}/confirm-legal-status`, {
      legalStatus,
      vatRateBasisPoints,
    });
  }
}
