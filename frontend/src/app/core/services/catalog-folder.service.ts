import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CatalogFolderProfile, UpsertCatalogFolderRequest } from '../models/catalog-folder.model';

@Injectable({ providedIn: 'root' })
export class CatalogFolderService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/catalog-folders`;

  // Shared, app-wide cache of the unfiltered folder list — same rationale as
  // ProductService/ServiceCatalogService/DiscountService: the advanced
  // settings picker on all three catalog forms, the mode rapide flyout, and
  // "Mes dossiers" itself all want the same unfiltered list without each
  // refetching it.
  private readonly _all = signal<CatalogFolderProfile[] | null>(null);
  readonly all = this._all.asReadonly();

  getAll(search?: string): Observable<CatalogFolderProfile[]> {
    const params = search ? new HttpParams().set('search', search) : undefined;
    return this.http.get<CatalogFolderProfile[]>(this.baseUrl, { params });
  }

  // Unfiltered list, loaded once and reused across every consumer — never
  // call this with a search term in mind, use getAll() for that.
  getAllCached(): Observable<CatalogFolderProfile[]> {
    const cached = this._all();
    if (cached) {
      return of(cached);
    }
    return this.getAll().pipe(tap((folders) => this._all.set(folders)));
  }

  getById(id: string): Observable<CatalogFolderProfile> {
    return this.http.get<CatalogFolderProfile>(`${this.baseUrl}/${id}`);
  }

  create(payload: UpsertCatalogFolderRequest): Observable<CatalogFolderProfile> {
    return this.http
      .post<CatalogFolderProfile>(this.baseUrl, payload)
      .pipe(tap((folder) => this.upsertInCache(folder)));
  }

  update(id: string, payload: UpsertCatalogFolderRequest): Observable<CatalogFolderProfile> {
    return this.http
      .patch<CatalogFolderProfile>(`${this.baseUrl}/${id}`, payload)
      .pipe(tap((folder) => this.upsertInCache(folder)));
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/${id}`)
      .pipe(tap(() => this.removeFromCache(id)));
  }

  private upsertInCache(folder: CatalogFolderProfile): void {
    const cached = this._all();
    if (!cached) {
      return; // not loaded yet — the next getAllCached() call picks it up
    }
    const index = cached.findIndex((f) => f.id === folder.id);
    this._all.set(
      index === -1 ? [...cached, folder] : cached.map((f, i) => (i === index ? folder : f)),
    );
  }

  private removeFromCache(id: string): void {
    const cached = this._all();
    if (!cached) {
      return;
    }
    this._all.set(cached.filter((f) => f.id !== id));
  }
}
