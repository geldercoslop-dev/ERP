import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.K6_EMAIL || 'k6@test.com';
const PASSWORD = process.env.K6_PASSWORD || 'k6test123';
const OUT_FILE = process.env.K6_TOKEN_FILE || 'tests/load/access_token.txt';

function extractTokenFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;

  const direct =
    (typeof obj.access_token === 'string' && obj.access_token) ||
    (typeof obj.accessToken === 'string' && obj.accessToken) ||
    (typeof obj.token === 'string' && obj.token) ||
    (typeof obj.sessionToken === 'string' && obj.sessionToken);
  if (direct) return direct;

  const nestedResult = obj.result;
  if (nestedResult && typeof nestedResult === 'object') {
    const resultObj = nestedResult as Record<string, unknown>;
    const nestedData = resultObj.data;
    if (nestedData && typeof nestedData === 'object') {
      return extractTokenFromPayload(nestedData);
    }
  }

  const nestedData = obj.data;
  if (nestedData && typeof nestedData === 'object') {
    return extractTokenFromPayload(nestedData);
  }

  return null;
}

async function requestJson(url: string, body: unknown): Promise<{ status: number; text: string; json: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  return { status: response.status, text, json: parsed };
}

async function main(): Promise<void> {
  const attempts = [
    {
      name: '/api/auth/login email/password',
      url: `${BASE_URL}/api/auth/login`,
      body: { email: EMAIL, password: PASSWORD },
    },
    {
      name: '/api/trpc/auth.login username/password',
      url: `${BASE_URL}/api/trpc/auth.login`,
      body: { username: EMAIL, password: PASSWORD },
    },
  ];

  for (const attempt of attempts) {
    const result = await requestJson(attempt.url, attempt.body);
    const token = extractTokenFromPayload(result.json);
    if (token) {
      fs.mkdirSync('tests/load', { recursive: true });
      fs.writeFileSync(OUT_FILE, token, 'utf8');
      console.log(`[get-token] source=${attempt.name}`);
      console.log(`[get-token] status=${result.status}`);
      console.log(`[get-token] access_token=${token}`);
      return;
    }

    console.warn(`[get-token] failed source=${attempt.name} status=${result.status}`);
  }

  throw new Error('[get-token] unable to obtain token from configured login endpoints');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
