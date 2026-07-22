import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CompanyProfile, UpdateCompanyRequest } from '../models/company.model';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/company`;

  getProfile(): Observable<CompanyProfile> {
    return this.http.get<CompanyProfile>(this.baseUrl);
  }

  updateProfile(profile: UpdateCompanyRequest): Observable<CompanyProfile> {
    return this.http.patch<CompanyProfile>(this.baseUrl, profile);
  }
}
