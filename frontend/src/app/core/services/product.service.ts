import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ImportedProductDraft,
  ProductProfile,
  UpsertProductRequest,
} from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/products`;

  getAll(search?: string): Observable<ProductProfile[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<ProductProfile[]>(this.baseUrl, { params });
  }

  importFromUrl(url: string): Observable<ImportedProductDraft> {
    return this.http.post<ImportedProductDraft>(`${this.baseUrl}/import`, { url });
  }

  getById(id: string): Observable<ProductProfile> {
    return this.http.get<ProductProfile>(`${this.baseUrl}/${id}`);
  }

  create(payload: UpsertProductRequest): Observable<ProductProfile> {
    return this.http.post<ProductProfile>(this.baseUrl, payload);
  }

  update(id: string, payload: UpsertProductRequest): Observable<ProductProfile> {
    return this.http.patch<ProductProfile>(`${this.baseUrl}/${id}`, payload);
  }
}
