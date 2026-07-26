import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUserList, CreatePromoCodeRequest, PromoCode } from '../models/admin.model';
import { SiteLegalInfo, UpdateSiteLegalInfoRequest } from '../models/site-legal.model';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/admin`;

  listUsers(search: string | undefined, page: number): Observable<AdminUserList> {
    let params = new HttpParams().set('page', page);
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<AdminUserList>(`${this.baseUrl}/users`, { params });
  }

  grantPremium(companyId: string, days: number): Observable<{ premiumGrantedUntil: string }> {
    return this.http.post<{ premiumGrantedUntil: string }>(
      `${this.baseUrl}/users/${companyId}/grant-premium`,
      { days },
    );
  }

  listPromoCodes(): Observable<PromoCode[]> {
    return this.http.get<PromoCode[]>(`${this.baseUrl}/promo-codes`);
  }

  createPromoCode(request: CreatePromoCodeRequest): Observable<PromoCode> {
    return this.http.post<PromoCode>(`${this.baseUrl}/promo-codes`, request);
  }

  setPromoCodeActive(id: string, active: boolean): Observable<{ id: string; active: boolean }> {
    return this.http.patch<{ id: string; active: boolean }>(`${this.baseUrl}/promo-codes/${id}`, {
      active,
    });
  }

  deletePromoCode(id: string): Observable<{ id: string }> {
    return this.http.delete<{ id: string }>(`${this.baseUrl}/promo-codes/${id}`);
  }

  // Read side is SiteLegalPublicService.get() (GET /site-legal is public) —
  // this service only owns the admin-only write.
  updateSiteLegalInfo(request: UpdateSiteLegalInfoRequest): Observable<SiteLegalInfo> {
    return this.http.patch<SiteLegalInfo>(`${this.baseUrl}/site-legal`, request);
  }
}
