import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CustomerProfile, UpsertCustomerRequest } from '../models/customer.model';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/customers`;

  getAll(search?: string): Observable<CustomerProfile[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<CustomerProfile[]>(this.baseUrl, { params });
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
