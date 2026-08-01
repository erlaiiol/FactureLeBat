import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AdminUserList,
  CreatePromoCodeRequest,
  PromoCode,
  PushDeviceList,
} from '../models/admin.model';
import { PlanTier } from '../models/billing.model';
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

  grantPremium(
    companyId: string,
    tier: PlanTier,
    days: number,
  ): Observable<{ premiumGrantedUntil: string; grantedPlanTier: PlanTier }> {
    return this.http.post<{ premiumGrantedUntil: string; grantedPlanTier: PlanTier }>(
      `${this.baseUrl}/users/${companyId}/grant-premium`,
      { tier, days },
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

  listPushDevices(search: string | undefined, page: number): Observable<PushDeviceList> {
    let params = new HttpParams().set('page', page);
    if (search) {
      params = params.set('search', search);
    }
    return this.http.get<PushDeviceList>(`${this.baseUrl}/push/devices`, { params });
  }

  sendTestPush(deviceId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/push/devices/${deviceId}/test`, {});
  }
}
