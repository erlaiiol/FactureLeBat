import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface PgClient {
  connect(): Promise<void>;
  query(sql: string, params: unknown[]): Promise<{ rowCount: number | null }>;
  end(): Promise<void>;
}

// The one thing the browser can never do: read the "verify your email" link
// out of an inbox (SMTP isn't configured against the dev backend). Inserts
// the same kind of AuthToken row AuthService.sendVerificationEmail would
// have, hashed the same way (token.util.ts's hashToken), straight into the
// dev Postgres the e2e backend runs on — reusing the backend's own `pg`
// driver and DATABASE_URL so the frontend package needs no extra dependency.
// The raw token returned is what the emailed link carries:
// /verifier-email?token=<raw>.
export async function createEmailVerificationToken(email: string): Promise<string> {
  const backendDir = path.resolve(process.cwd(), '../backend');
  const envFile = readFileSync(path.join(backendDir, '.env'), 'utf8');
  const databaseUrl = /^DATABASE_URL=["']?([^"'\n]+)["']?/m.exec(envFile)?.[1];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not found in backend/.env');
  }
  const { Client } = createRequire(path.join(backendDir, 'package.json'))('pg') as {
    Client: new (config: { connectionString: string }) => PgClient;
  };

  const rawToken = randomBytes(32).toString('hex');
  const client = new Client({ connectionString: databaseUrl.split('?')[0] });
  await client.connect();
  try {
    const result = await client.query(
      `INSERT INTO "AuthToken" (id, "userId", purpose, "tokenHash", "expiresAt")
       SELECT gen_random_uuid()::text, id, 'EMAIL_VERIFICATION', $2, now() + interval '1 hour'
       FROM "User" WHERE email = $1`,
      [email, createHash('sha256').update(rawToken).digest('hex')],
    );
    if (result.rowCount !== 1) {
      throw new Error(`No user found for ${email}`);
    }
  } finally {
    await client.end();
  }
  return rawToken;
}
