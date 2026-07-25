import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CustomerProfile,
  CustomerSearchResult,
  CustomerSortBy,
  UpsertCustomerRequest,
} from '../models/customer.model';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/customers`;

  // Phase 14.5: search matches name/companyName/address/description; sortBy
  // adds alphabetical/dernière facture/dernier devis/date de création
  // ordering — see CustomerService.findAll on the backend.
  getAll(search?: string, sortBy?: CustomerSortBy): Observable<CustomerSearchResult[]> {
    let params = new HttpParams();
    if (search) {
      params = params.set('search', search);
    }
    if (sortBy) {
      params = params.set('sortBy', sortBy);
    }
    return this.http.get<CustomerSearchResult[]>(this.baseUrl, { params });
  }

  getById(id: string): Observable<CustomerProfile> {
    return this.http.get<CustomerProfile>(`${this.baseUrl}/${id}`);
  }

  create(payload: UpsertCustomerRequest): Observable<CustomerProfile> {
    return this.http.post<CustomerProfile>(this.baseUrl, payload);
  }

  update(id: string, payload: UpsertCustomerRequest): Observable<CustomerProfile> {
    return this.http.patch<CustomerProfile>(`${this.baseUrl}/${id}`, payload);
  }
}
