import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DiscountProfile, UpsertDiscountRequest } from '../models/discount.model';

@Injectable({ providedIn: 'root' })
export class DiscountService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/discounts`;

  // Shared, app-wide cache of the unfiltered discount list — see
  // ServiceCatalogService.all for why this lives on the singleton service
  // rather than on each consumer.
  private readonly _all = signal<DiscountProfile[] | null>(null);
  readonly all = this._all.asReadonly();

  getAll(search?: string): Observable<DiscountProfile[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<DiscountProfile[]>(this.baseUrl, { params });
  }

  // Unfiltered list, loaded once and reused across every consumer — never
  // call this with a search term in mind, use getAll() for that.
  getAllCached(): Observable<DiscountProfile[]> {
    const cached = this._all();
    if (cached) {
      return of(cached);
    }
    return this.getAll().pipe(tap((discounts) => this._all.set(discounts)));
  }

  getById(id: string): Observable<DiscountProfile> {
    return this.http.get<DiscountProfile>(`${this.baseUrl}/${id}`);
  }

  create(payload: UpsertDiscountRequest): Observable<DiscountProfile> {
    return this.http
      .post<DiscountProfile>(this.baseUrl, payload)
      .pipe(tap((discount) => this.upsertInCache(discount)));
  }

  update(id: string, payload: UpsertDiscountRequest): Observable<DiscountProfile> {
    return this.http
      .patch<DiscountProfile>(`${this.baseUrl}/${id}`, payload)
      .pipe(tap((discount) => this.upsertInCache(discount)));
  }

  private upsertInCache(discount: DiscountProfile): void {
    const cached = this._all();
    if (!cached) {
      return; // not loaded yet — the next getAllCached() call picks it up
    }
    const index = cached.findIndex((d) => d.id === discount.id);
    this._all.set(
      index === -1 ? [...cached, discount] : cached.map((d, i) => (i === index ? discount : d)),
    );
  }
}
