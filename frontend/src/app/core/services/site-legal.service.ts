import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SiteLegalInfo } from '../models/site-legal.model';

// GET /site-legal is @Public() on the backend — read by both the
// unauthenticated /mentions-legales page and the FooterComponent's contact
// link, and reused (not duplicated) by the admin "Infos légales" form for
// prefill, since mentions légales are public data by law regardless of who's
// reading them.
@Injectable({ providedIn: 'root' })
export class SiteLegalPublicService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/site-legal`;

  get(): Observable<SiteLegalInfo> {
    return this.http.get<SiteLegalInfo>(this.baseUrl);
  }
}
