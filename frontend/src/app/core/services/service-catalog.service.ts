import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ServiceProfile, UpsertServiceRequest } from '../models/service.model';

@Injectable({ providedIn: 'root' })
export class ServiceCatalogService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/services`;

  getAll(search?: string): Observable<ServiceProfile[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<ServiceProfile[]>(this.baseUrl, { params });
  }

  getById(id: string): Observable<ServiceProfile> {
    return this.http.get<ServiceProfile>(`${this.baseUrl}/${id}`);
  }

  create(payload: UpsertServiceRequest): Observable<ServiceProfile> {
    return this.http.post<ServiceProfile>(this.baseUrl, payload);
  }

  update(id: string, payload: UpsertServiceRequest): Observable<ServiceProfile> {
    return this.http.patch<ServiceProfile>(`${this.baseUrl}/${id}`, payload);
  }
}
