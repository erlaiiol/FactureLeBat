import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

export interface TestSession {
  // Bare `name=value` pairs only (Set-Cookie's own attributes — Path,
  // HttpOnly, SameSite, Expires — stripped off), same shape a browser's
  // Cookie request header actually uses. Passing the raw Set-Cookie
  // strings straight through as a Cookie header is invalid and silently
  // fails to authenticate — see the comment on registerTestUser below.
  cookies: string[];
  xsrfToken: string;
  companyId: string;
}

let counter = 0;

// Registers a fresh, uniquely-emailed artisan account against the given
// (already-init'd) Nest app and returns what's needed to authenticate every
// subsequent supertest request as that user — every domain e2e spec needs
// this now that JwtAuthGuard is global (see docs/roadmap.md Phase 13).
// companyId is returned too so a spec's afterAll can clean up with a single
// prisma.company.delete(), which cascades through every table this whole
// test's data could have touched (Customer/Product/Service/Invoice/...) —
// same one-call cleanup AuthService.deleteAccount itself relies on.
export async function registerTestUser(app: INestApplication<App>): Promise<TestSession> {
  counter += 1;
  const email = `e2e-${Date.now()}-${counter}@example.com`;
  const response = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password: 'motdepasse123', acceptTerms: true })
    .expect(201);

  // superagent types response.headers loosely (Record<string, string>), but
  // 'set-cookie' is always an array of raw Set-Cookie strings in practice.
  const setCookieHeader = response.headers['set-cookie'] as unknown as string[] | undefined;
  const rawCookies = setCookieHeader ?? [];
  // Each Set-Cookie string looks like "name=value; Path=/api; HttpOnly; ..."
  // — a request's Cookie header only ever carries the "name=value" part.
  const cookies = rawCookies.map((cookie) => cookie.split(';')[0]);
  const xsrfCookie = cookies.find((cookie) => cookie.startsWith('XSRF-TOKEN='));
  if (!xsrfCookie) {
    throw new Error('XSRF-TOKEN cookie not found in register response');
  }

  const companyId = (response.body as { companyId: string }).companyId;
  return { cookies, xsrfToken: xsrfCookie.split('=')[1], companyId };
}

// Wraps supertest with the cookie/CSRF plumbing every authenticated e2e
// request now needs: the session cookies on every call, plus X-XSRF-TOKEN
// on mutating ones (CsrfGuard rejects POST/PATCH/PUT/DELETE without it —
// see auth/guards/csrf.guard.ts). Returns the same chainable supertest
// Test objects specs already use (.send/.query/.expect/...), just
// pre-authenticated.
export function authedRequest(app: INestApplication<App>, session: TestSession) {
  const agent = request(app.getHttpServer());
  const cookieHeader = session.cookies.join('; ');
  return {
    get: (url: string) => agent.get(url).set('Cookie', cookieHeader),
    post: (url: string) =>
      agent.post(url).set('Cookie', cookieHeader).set('X-XSRF-TOKEN', session.xsrfToken),
    patch: (url: string) =>
      agent.patch(url).set('Cookie', cookieHeader).set('X-XSRF-TOKEN', session.xsrfToken),
    delete: (url: string) =>
      agent.delete(url).set('Cookie', cookieHeader).set('X-XSRF-TOKEN', session.xsrfToken),
  };
}
