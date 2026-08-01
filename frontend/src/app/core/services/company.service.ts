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

  uploadLogo(file: File): Observable<CompanyProfile> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<CompanyProfile>(`${this.baseUrl}/logo`, formData);
  }

  removeLogo(): Observable<CompanyProfile> {
    return this.http.delete<CompanyProfile>(`${this.baseUrl}/logo`);
  }

  // Plain <img src> URL — auth travels via the httpOnly cookie, same as
  // pdfUrl()/getPdfBlob() elsewhere. cacheBust should be bumped by the
  // caller (e.g. Date.now()) right after a successful upload/remove, since
  // GET /company/logo is otherwise cacheable for a few minutes (see
  // CompanyController.serveLogo) and the URL itself never changes.
  logoUrl(cacheBust?: number): string {
    return cacheBust ? `${this.baseUrl}/logo?v=${cacheBust}` : `${this.baseUrl}/logo`;
  }
}
