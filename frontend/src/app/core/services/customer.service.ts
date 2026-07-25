import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
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

  // Shared, app-wide cache of the unfiltered customer list — `providedIn:
  // 'root'` makes this service a singleton, so every consumer (invoice
  // creation's picker, other pages) reads the same signal instead of each
  // holding its own snapshot from whenever it happened to call getAll().
  // create()/update() keep it in sync so a customer added or edited on one
  // screen is immediately selectable everywhere else, no page refresh
  // needed. Stays `null` until first requested via getAllCached().
  private readonly _all = signal<CustomerSearchResult[] | null>(null);
  readonly all = this._all.asReadonly();

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

  // Unfiltered list, loaded once and reused across every consumer — never
  // call this with a search term in mind, use getAll() for that.
  getAllCached(): Observable<CustomerSearchResult[]> {
    const cached = this._all();
    if (cached) {
      return of(cached);
    }
    return this.getAll().pipe(tap((customers) => this._all.set(customers)));
  }

  getById(id: string): Observable<CustomerProfile> {
    return this.http.get<CustomerProfile>(`${this.baseUrl}/${id}`);
  }

  create(payload: UpsertCustomerRequest): Observable<CustomerProfile> {
    return this.http
      .post<CustomerProfile>(this.baseUrl, payload)
      .pipe(tap((customer) => this.upsertInCache(customer)));
  }

  update(id: string, payload: UpsertCustomerRequest): Observable<CustomerProfile> {
    return this.http
      .patch<CustomerProfile>(`${this.baseUrl}/${id}`, payload)
      .pipe(tap((customer) => this.upsertInCache(customer)));
  }

  private upsertInCache(customer: CustomerProfile): void {
    const cached = this._all();
    if (!cached) {
      return; // not loaded yet — the next getAllCached() call picks it up
    }
    const index = cached.findIndex((c) => c.id === customer.id);
    if (index === -1) {
      // A brand-new customer has no invoice history yet — these are
      // genuinely null, not placeholders.
      this._all.set([
        ...cached,
        { ...customer, lastDevisDate: null, lastFactureDate: null, matchSnippet: null },
      ]);
      return;
    }
    // Merge over the existing entry so lastDevisDate/lastFactureDate/
    // matchSnippet (search-only fields create()/update() never return)
    // survive the update.
    this._all.set(cached.map((c, i) => (i === index ? { ...c, ...customer } : c)));
  }
}
