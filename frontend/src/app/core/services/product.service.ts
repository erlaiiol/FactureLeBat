import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
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

  // Shared, app-wide cache of the unfiltered product list — see
  // CustomerService.all for why this lives on the singleton service rather
  // than on each consumer.
  private readonly _all = signal<ProductProfile[] | null>(null);
  readonly all = this._all.asReadonly();

  getAll(search?: string): Observable<ProductProfile[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<ProductProfile[]>(this.baseUrl, { params });
  }

  // Unfiltered list, loaded once and reused across every consumer — never
  // call this with a search term in mind, use getAll() for that.
  getAllCached(): Observable<ProductProfile[]> {
    const cached = this._all();
    if (cached) {
      return of(cached);
    }
    return this.getAll().pipe(tap((products) => this._all.set(products)));
  }

  // `html` is the fallback path for sites (leroymerlin.fr, sfic.com...)
  // whose bot protection blocks the backend's own fetch — the caller's
  // browser fetched the page instead and pastes its source here.
  importFromUrl(url: string, html?: string): Observable<ImportedProductDraft> {
    return this.http.post<ImportedProductDraft>(`${this.baseUrl}/import`, { url, html });
  }

  getById(id: string): Observable<ProductProfile> {
    return this.http.get<ProductProfile>(`${this.baseUrl}/${id}`);
  }

  create(payload: UpsertProductRequest): Observable<ProductProfile> {
    return this.http
      .post<ProductProfile>(this.baseUrl, payload)
      .pipe(tap((product) => this.upsertInCache(product)));
  }

  update(id: string, payload: UpsertProductRequest): Observable<ProductProfile> {
    return this.http
      .patch<ProductProfile>(`${this.baseUrl}/${id}`, payload)
      .pipe(tap((product) => this.upsertInCache(product)));
  }

  private upsertInCache(product: ProductProfile): void {
    const cached = this._all();
    if (!cached) {
      return; // not loaded yet — the next getAllCached() call picks it up
    }
    const index = cached.findIndex((p) => p.id === product.id);
    this._all.set(
      index === -1 ? [...cached, product] : cached.map((p, i) => (i === index ? product : p)),
    );
  }
}
