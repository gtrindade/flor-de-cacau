import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { authOptions } from '../../src/lib/server/auth-options';
import { pool } from '../../src/lib/server/db';

if (process.env.APP_ENV !== 'e2e' || !process.env.DATABASE_URL?.endsWith('/flora_e2e'))
  throw new Error('OAuth contracts require flora_e2e.');
const origin = process.env.BETTER_AUTH_URL!;
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: 'jwk' }),
  kid: 'test-key',
  use: 'sig',
  alg: 'RS256'
};
const auth = betterAuth({
  ...authOptions,
  socialProviders: {
    google: { clientId: 'test-google-client', clientSecret: 'test-google-secret' }
  }
});
const realFetch = globalThis.fetch;
let profile = {
  sub: 'google-test-admin',
  name: 'Admin de Teste',
  email: 'admin@example.test',
  email_verified: true,
  aud: 'test-google-client'
};
let nonce: string | null = null;
let calls: string[] = [];
function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' })
  ).toString('base64url');
  const claims = Buffer.from(
    JSON.stringify({
      ...profile,
      iss: 'https://accounts.google.com',
      iat: now,
      exp: now + 3600,
      ...(nonce ? { nonce } : {})
    })
  ).toString('base64url');
  const unsigned = `${header}.${claims}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), keys.privateKey).toString('base64url')}`;
}
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  calls.push(url);
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
  if (url === 'https://oauth2.googleapis.com/token') {
    const token = makeToken();
    return Response.json({
      access_token: 'fake-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: token
    });
  }
  throw new Error(`Unexpected external request in OAuth contract: ${url}`);
};
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((s) => s.split(';')[0])
    .join('; ');
}
async function start() {
  calls = [];
  const response = await auth.handler(
    new Request(`${origin}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({
        provider: 'google',
        callbackURL: `${origin}/admin`,
        errorCallbackURL: `${origin}/entrar?error=access_denied`
      })
    })
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  const authorization = new URL(data.url);
  assert.equal(authorization.origin, 'https://accounts.google.com');
  assert.equal(
    authorization.searchParams.get('redirect_uri'),
    `${origin}/api/auth/callback/google`
  );
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorization.searchParams.get('scope')?.includes('openid'));
  nonce = authorization.searchParams.get('nonce');
  return { state: authorization.searchParams.get('state')!, cookie: cookies(response) };
}
async function callback() {
  const flow = await start();
  return auth.handler(
    new Request(
      `${origin}/api/auth/callback/google?code=controlled-code&state=${encodeURIComponent(flow.state)}`,
      { headers: { cookie: flow.cookie } }
    )
  );
}
test('Google callback with verified allowed profile creates a real session', async () => {
  const response = await callback();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `${origin}/admin`);
  assert.match(cookies(response), /better-auth.session_token/);
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: cookies(response) })
  });
  assert.equal(session?.user.email, 'admin@example.test');
  assert.ok(calls.includes('https://oauth2.googleapis.com/token'));
});
test('first allowed Google sign-in creates an administrative identity', async () => {
  const originalProfile = { ...profile };
  const originalAllowlist = process.env.ADMIN_EMAILS;
  try {
    process.env.ADMIN_EMAILS = `${originalAllowlist},first-admin@example.test`;
    profile = { ...profile, sub: 'google-first-admin', email: 'first-admin@example.test' };
    const response = await callback();
    assert.equal(response.headers.get('location'), `${origin}/admin`);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookies(response) })
    });
    assert.equal(session?.user.email, 'first-admin@example.test');
    assert.equal(session?.user.emailVerified, true);
  } finally {
    profile = originalProfile;
    process.env.ADMIN_EMAILS = originalAllowlist;
  }
});
test('fresh provider verification is required even for an existing allowed account', async () => {
  profile = { ...profile, email_verified: false };
  const response = await callback();
  assert.match(response.headers.get('location') ?? '', /error=access_denied/);
  assert.doesNotMatch(cookies(response), /better-auth.session_token/);
  profile = { ...profile, email_verified: true };
});
test('unknown Google identity is rejected', async () => {
  const original = { ...profile };
  for (const change of [{ sub: 'stranger-google', email: 'stranger@example.test' }]) {
    profile = { ...original, ...change };
    const response = await callback();
    assert.notEqual(response.headers.get('location'), `${origin}/admin`);
    assert.doesNotMatch(cookies(response), /better-auth.session_token/);
  }
  profile = original;
});
test('direct ID tokens require a valid signature and the expected audience', async () => {
  const original = { ...profile };
  nonce = null;
  const send = (token: string) =>
    auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({
          provider: 'google',
          idToken: { token },
          callbackURL: `${origin}/admin`
        })
      })
    );
  const valid = await send(makeToken());
  assert.equal(valid.status, 200);
  assert.match(cookies(valid), /better-auth.session_token/);
  assert.ok(calls.includes('https://www.googleapis.com/oauth2/v3/certs'));
  profile = { ...original, aud: 'wrong-client' };
  const wrongAudience = await send(makeToken());
  assert.equal(wrongAudience.status, 401);
  assert.doesNotMatch(cookies(wrongAudience), /better-auth.session_token/);
  profile = original;
  const token = makeToken();
  const tampered = token.slice(0, -8) + 'xxxxxxxx';
  const invalid = await send(tampered);
  assert.equal(invalid.status, 401);
  assert.doesNotMatch(cookies(invalid), /better-auth.session_token/);
});
test('invalid state and user cancellation cannot create a session', async () => {
  const flow = await start();
  for (const query of [
    `code=controlled-code&state=bad-state`,
    `error=access_denied&state=${encodeURIComponent(flow.state)}`
  ]) {
    const response = await auth.handler(
      new Request(`${origin}/api/auth/callback/google?${query}`, {
        headers: { cookie: flow.cookie }
      })
    );
    assert.doesNotMatch(cookies(response), /better-auth.session_token/);
    assert.notEqual(response.headers.get('location'), `${origin}/admin`);
  }
});
after(async () => {
  globalThis.fetch = realFetch;
  await pool.end();
});
