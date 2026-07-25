import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ServiceProfile, UpsertServiceRequest } from '../models/service.model';

@Injectable({ providedIn: 'root' })
export class ServiceCatalogService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/services`;

  // Shared, app-wide cache of the unfiltered service list — see
  // CustomerService.all for why this lives on the singleton service rather
  // than on each consumer.
  private readonly _all = signal<ServiceProfile[] | null>(null);
  readonly all = this._all.asReadonly();

  getAll(search?: string): Observable<ServiceProfile[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<ServiceProfile[]>(this.baseUrl, { params });
  }

  // Unfiltered list, loaded once and reused across every consumer — never
  // call this with a search term in mind, use getAll() for that.
  getAllCached(): Observable<ServiceProfile[]> {
    const cached = this._all();
    if (cached) {
      return of(cached);
    }
    return this.getAll().pipe(tap((services) => this._all.set(services)));
  }

  getById(id: string): Observable<ServiceProfile> {
    return this.http.get<ServiceProfile>(`${this.baseUrl}/${id}`);
  }

  create(payload: UpsertServiceRequest): Observable<ServiceProfile> {
    return this.http
      .post<ServiceProfile>(this.baseUrl, payload)
      .pipe(tap((service) => this.upsertInCache(service)));
  }

  update(id: string, payload: UpsertServiceRequest): Observable<ServiceProfile> {
    return this.http
      .patch<ServiceProfile>(`${this.baseUrl}/${id}`, payload)
      .pipe(tap((service) => this.upsertInCache(service)));
  }

  private upsertInCache(service: ServiceProfile): void {
    const cached = this._all();
    if (!cached) {
      return; // not loaded yet — the next getAllCached() call picks it up
    }
    const index = cached.findIndex((s) => s.id === service.id);
    this._all.set(
      index === -1 ? [...cached, service] : cached.map((s, i) => (i === index ? service : s)),
    );
  }
}
