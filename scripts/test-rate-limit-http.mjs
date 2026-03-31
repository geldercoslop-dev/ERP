#!/usr/bin/env node

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOGIN_PATH = '/api/trpc/auth.login';
const WINDOW_MS = 60_000;

function parseSetCookie(setCookie) {
  const jar = {};
  if (!setCookie) return jar;
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const value of values) {
    const pair = String(value).split(';')[0];
    const eqIndex = pair.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = pair.slice(0, eqIndex).trim();
    const cookieValue = pair.slice(eqIndex + 1).trim();
    if (name) jar[name] = cookieValue;
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function requestCsrf() {
  const response = await fetch(`${BASE_URL}/api/csrf-token`, {
    method: 'GET',
    headers: { 'User-Agent': 'rate-limit-test/1.0' },
  });
  const data = await response.json();
  const setCookie = response.headers.get('set-cookie');
  return {
    status: response.status,
    data,
    jar: parseSetCookie(setCookie),
  };
}

async function loginAttempt(csrfToken, jar, index) {
  const response = await fetch(`${BASE_URL}${LOGIN_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'rate-limit-test/1.0',
      'x-csrf-token': csrfToken,
      Cookie: cookieHeader(jar),
    },
    body: JSON.stringify({
      json: {
        username: 'admin',
        password: `invalid-${index}`,
      },
    }),
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text,
  };
}

async function run() {
  console.log(`[STEP] Base URL: ${BASE_URL}`);

  const csrf = await requestCsrf();
  if (csrf.status !== 200 || !csrf.data || typeof csrf.data.csrfToken !== 'string') {
    console.error('[FAIL] CSRF token request failed', csrf.status, csrf.data);
    process.exit(1);
  }

  console.log(`[OK] CSRF status=${csrf.status} token_len=${csrf.data.csrfToken.length}`);

  const statuses = [];
  for (let i = 1; i <= 11; i += 1) {
    const result = await loginAttempt(csrf.data.csrfToken, csrf.jar, i);
    statuses.push(result.status);
    console.log(`[TRY ${i}] status=${result.status}`);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const first429 = statuses.findIndex((s) => s === 429);
  console.log(`[RESULT] statuses=${JSON.stringify(statuses)}`);
  console.log(`[RESULT] first429=${first429 >= 0 ? first429 + 1 : 'none'}`);

  const blocked = first429 >= 0;
  if (!blocked) {
    console.error('[FAIL] Rate limit did not block in 11 attempts');
    process.exit(2);
  }

  console.log(`[WAIT] Waiting ${WINDOW_MS}ms to verify release...`);
  await new Promise((resolve) => setTimeout(resolve, WINDOW_MS));

  const afterWait = await loginAttempt(csrf.data.csrfToken, csrf.jar, 999);
  console.log(`[AFTER_WAIT] status=${afterWait.status}`);

  if (afterWait.status === 429) {
    console.error('[FAIL] Rate limit did not reset after window');
    process.exit(3);
  }

  console.log('[PASS] Redis rate limit blocked and then released after window');
  process.exit(0);
}

run().catch((error) => {
  console.error('[ERROR]', error?.message || error);
  process.exit(10);
});
