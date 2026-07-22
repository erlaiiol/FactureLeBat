import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ComplementarySuggestion,
  SearchSuppliersRequest,
  SourcingSearchResult,
  SuggestComplementaryRequest,
  SupplierCandidate,
} from '../models/sourcing.model';

@Injectable({ providedIn: 'root' })
export class SourcingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/sourcing`;

  searchSuppliers(
    payload: SearchSuppliersRequest,
  ): Observable<SourcingSearchResult<SupplierCandidate>> {
    return this.http.post<SourcingSearchResult<SupplierCandidate>>(
      `${this.baseUrl}/suppliers/search`,
      payload,
    );
  }

  suggestComplementary(
    payload: SuggestComplementaryRequest,
  ): Observable<SourcingSearchResult<ComplementarySuggestion>> {
    return this.http.post<SourcingSearchResult<ComplementarySuggestion>>(
      `${this.baseUrl}/complementary-suggestions`,
      payload,
    );
  }
}
