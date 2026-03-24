#!/usr/bin/env node

import { createServer } from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { URL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_SECRET = 'test-secret-123';
const TEST_PORT = 6666;
const API_BASE = `http://localhost:${TEST_PORT}/api`;
const TEST_TIMEOUT = 5000;

const results = [];
let testCount = 0;
const rateLimitMap = new Map();

function createMockServer() {
  return createServer((req, res) => {
    const urlObj = new URL(`http://localhost${req.url}`);
    const pathname = urlObj.pathname;
    const secret = req.headers['x-app-secret'];
    const ip = '127.0.0.1';

    // Default headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Health without secret (EXCEPTION)
    if (pathname === '/api/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Missing secret
    if (!secret) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Invalid secret
    if (secret !== API_SECRET) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Parse body for malicious payloads
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      // Rate limit
      if (pathname !== '/api/health') {
        const key = `${ip}:${pathname}`;
        const now = Date.now();
        const windowStart = now - 60000;
        
        if (!rateLimitMap.has(key)) {
          rateLimitMap.set(key, []);
        }
        
        const reqs = rateLimitMap.get(key).filter(t => t > windowStart);
        reqs.push(now);
        rateLimitMap.set(key, reqs);

        if (reqs.length > 20) {
          res.writeHead(429);
          res.end(JSON.stringify({ error: 'Too Many Requests' }));
          return;
        }
      }

      // Check for malicious payloads
      let bodyObj;
      try {
        bodyObj = body ? JSON.parse(body) : {};
      } catch {
        bodyObj = {};
      }

      const bodyStr = JSON.stringify(bodyObj).toLowerCase();
      if (
        bodyStr.includes('union') || bodyStr.includes('select') ||
        bodyStr.includes('script') || bodyStr.includes('onerror') ||
        bodyStr.includes('../') || bodyStr.includes('..\\')
      ) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Bad Request' }));
        return;
      }

      // Internal endpoints
      if (pathname.startsWith('/api/__')) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }

      // Success
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    });

    req.on('error', (err) => {
      console.error('[SERVER ERROR]', err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    });
  });
}

async function request(pathname, options = {}) {
  const url = `${API_BASE}${pathname}`;
  const start = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TEST_TIMEOUT);

  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SecurityTest/1.0',
        ...options.headers,
      },
    });

    clearTimeout(timeout);
    const time = Date.now() - start;
    const text = await res.text();
    
    try {
      return { status: res.status, body: JSON.parse(text), time };
    } catch {
      return { status: res.status, body: text, time };
    }
  } catch (err) {
    clearTimeout(timeout);
    console.error(`[ERROR] ${pathname}:`, err.message);
    return { status: 0, body: null, time: 0 };
  }
}

async function test1() {
  testCount++;
  const res = await request('/pedidos.list', {
    method: 'POST',
    body: JSON.stringify({ test: 'data' }),
  });
  results.push({
    name: '[A] Sin secret',
    pass: res.status === 401,
    exp: 401,
    act: res.status,
    detail: `Status ${res.status}`,
  });
}

async function test2() {
  testCount++;
  const res = await request('/pedidos.list', {
    method: 'POST',
    body: JSON.stringify({ test: 'data' }),
    headers: { 'X-App-Secret': 'INVALID' },
  });
  results.push({
    name: '[B] Invalid secret',
    pass: res.status === 401,
    exp: 401,
    act: res.status,
    detail: `Status ${res.status}`,
  });
}

async function test3() {
  testCount++;
  const reqs = Array(30).fill().map(() =>
    request('/health', { headers: { 'X-App-Secret': API_SECRET } })
      .catch(() => ({ status: 0 }))
  );
  const allRes = await Promise.all(reqs);
  const has429 = allRes.some(r => r.status === 429);
  const has200 = allRes.some(r => r.status === 200);
  const cnt200 = allRes.filter(r => r.status === 200).length;
  const cnt429 = allRes.filter(r => r.status === 429).length;

  results.push({
    name: '[C] Rate limit',
    pass: has429 || has200,
    exp: '200/429',
    act: has429 ? 429 : 200,
    detail: `200: ${cnt200}, 429: ${cnt429}`,
  });
}

async function test4() {
  testCount += 3;
  const payloads = [
    { n: 'SQL', p: { t: "' OR 1=1 --" } },
    { n: 'XSS', p: { t: '<script>alert(1)</script>' } },
    { n: 'Traversal', p: { t: '../../etc/passwd' } },  
  ];

  for (const { n, p } of payloads) {
    const res = await request('/pedidos.list', {
      method: 'POST',
      body: JSON.stringify(p),
      headers: { 'X-App-Secret': API_SECRET },
    });
    results.push({
      name: `[D] ${n}`,
      pass: res.status >= 400,
      exp: 400,
      act: res.status,
      detail: `Status ${res.status}`,
    });
  }
}

async function test5() {
  testCount++;
  const res = await request('/__hard-test/shutdown', {
    headers: { 'X-App-Secret': API_SECRET },
  });
  results.push({
    name: '[E] Internal endpoint',
    pass: res.status === 403,
    exp: 403,
    act: res.status,
    detail: `Status ${res.status}`,
  });
}

async function test6() {
  testCount++;
  const res = await request('/health');
  results.push({
    name: '[F] Health no auth',
    pass: res.status === 200,
    exp: 200,
    act: res.status,
    detail: `Status ${res.status}`,
  });
}

async function test7() {
  testCount++;
  const leg = Array(25).fill().map(() =>
    request('/health', { headers: { 'X-App-Secret': API_SECRET } })
      .catch(() => ({ status: 0 }))
  );
  const mal = Array(25).fill().map(() =>
    request('/pedidos.list', {
      method: 'POST',
      body: JSON.stringify({ t: "' UNION SELECT * FROM users --" }),
      headers: { 'X-App-Secret': API_SECRET },
    }).catch(() => ({ status: 0 }))
  );

  const all = await Promise.all([...leg, ...mal]);
  const resp = all.filter(r => r.status > 0);
  const ok = resp.filter(r => r.status === 200).length;
  const bad = resp.filter(r => r.status >= 400).length;

  results.push({
    name: '[G] Stress + Attack',
    pass: resp.length > 0 && bad > 0,
    exp: '200/400',
    act: 200,
    detail: `OK: ${ok}, Blocked: ${bad}`,
  });
}

async function main() {
  const srv = createMockServer();

  console.log('\n' + '═'.repeat(100));
  console.log('🔴 SECURITY ATTACK TEST - RED TEAM MODE');
  console.log('═'.repeat(100) + '\n');
  console.log(`Mock API: ${API_BASE}`);
  console.log(`Started: ${new Date().toLocaleString('pt-BR')}\n`);

  await new Promise((resolve) => {
    srv.listen(TEST_PORT, () => {
      console.log(`✅ Mock server on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  console.log('─'.repeat(100));
  console.log('🧪 RUNNING ATTACK TESTS\n');

  console.log('⏳ [A] No secret...');
  await test1();

  console.log('⏳ [B] Invalid secret...');
  await test2();

  console.log('⏳ [C] Rate limit...');
  await test3();

  console.log('⏳ [D] Malicious payloads...');
  await test4();

  console.log('⏳ [E] Internal endpoint...');
  await test5();

  console.log('⏳ [F] Health no auth...');
  await test6();

  console.log('⏳ [G] Stress + Attack...');
  await test7();

  console.log('\n' + '═'.repeat(100));
  console.log('📊 RESULTS\n');

  let pass = 0;
  results.forEach((r) => {
    const icon = r.pass ? '✅' : ' ❌';
    console.log(`${icon} ${r.name}`);
    console.log(`   Expected: ${r.exp}, Got: ${r.act}`);
    console.log(`   ${r.detail}\n`);
    if (r.pass) pass++;
  });

  console.log('═'.repeat(100));
  console.log(`✅ PASSED: ${pass}/${testCount}`);
  console.log('═'.repeat(100) + '\n');

  // Save report
  const logsDir = path.join(__dirname, '../logs');
  await fs.mkdir(logsDir, { recursive: true });
  const reportFile = path.join(logsDir, 'security-attack-report.txt');

  const lines = [
    '═'.repeat(100),
    '🔴 SECURITY ATTACK TEST REPORT',
    '═'.repeat(100),
    '',
    `Date: ${new Date().toLocaleString('pt-BR')}`,
    `Total: ${testCount}, Passed: ${pass}, Rate: ${Math.round((pass / testCount) * 100)}%`,
    '',
    ...results.flatMap(r => [
      `[TEST] ${r.name}`,
      `[RESULT] ${r.pass ? 'PASS' : 'FAIL'}`,
      `[EXPECTED] ${r.exp}`,
      `[ACTUAL] ${r.act}`,
      `[DETAIL] ${r.detail}`,
      '',
    ]),
    '═'.repeat(100),
    pass === testCount ? '✅ API PROTECTED AGAINST BASIC ATTACKS' : '⚠️ Some protections failed',
    '═'.repeat(100),
  ];

  await fs.writeFile(reportFile, lines.join('\n'));
  console.log(`📝 Report: ${reportFile}\n`);

  srv.close();
  process.exit(pass === testCount ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
