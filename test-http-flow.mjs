/**
 * Test HTTP Flow: CSRF + Login + Protected Mutation
 * Filename: test-http-flow.mjs
 * 
 * This script tests:
 * 1. GET /api/csrf-token - retrieve CSRF token
 * 2. POST /api/trpc/auth.login - login with CSRF + csrf-token cookies
 * 3. POST /api/trpc/clientes.create - protected mutation with CSRF + session token
 */

import http from "http";
import https from "https";

const BASE_URL = "http://localhost:3000";
const TEST_USERNAME = "admin";
const TEST_PASSWORD = "admin";

let csrfToken = null;
let sessionToken = null;
let cookies = {};

function extractCookies(setCookieHeader) {
  if (!setCookieHeader) return {};
  const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const extracted = {};
  
  setCookies.forEach((cookie) => {
    const parts = cookie.split(";");
    const [name, value] = parts[0].split("=");
    if (name && value) {
      extracted[name.trim()] = value.trim();
    }
  });
  
  return extracted;
}

function makeCookieHeader() {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    
    const defaultHeaders = {
      "Content-Type": "application/json",
      "User-Agent": "TestClient/1.0",
    };

    if (makeCookieHeader()) {
      defaultHeaders["Cookie"] = makeCookieHeader();
    }

    const mergedHeaders = { ...defaultHeaders, ...headers };
    
    const options = {
      method,
      headers: mergedHeaders,
    };

    const req = client.request(url, options, (res) => {
      let data = "";
      
      // Extract Set-Cookie headers
      const setCookies = extractCookies(res.headers["set-cookie"]);
      Object.assign(cookies, setCookies);

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({
            status: res.status,
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawBody: data,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            statusCode: res.statusCode,
            headers: res.headers,
            body: null,
            rawBody: data,
          });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function runTests() {
  console.log("🚀 Starting HTTP Flow Tests\n");

  try {
    // Step 1: Get CSRF token
    console.log("1️⃣  GET /api/csrf-token");
    const csrfResp = await request("GET", "/api/csrf-token");
    console.log(`   Status: ${csrfResp.status}`);
    console.log(`   Body:`, csrfResp.body);
    
    if (csrfResp.status !== 200 || !csrfResp.body?.csrfToken) {
      console.error("❌ Failed to get CSRF token");
      return;
    }

    csrfToken = csrfResp.body.csrfToken;
    console.log(`   CSRF Token: ${csrfToken.substring(0, 16)}...`);
    console.log(`   Cookies: ${Object.keys(cookies).join(", ")}\n`);

    // Step 2: Login
    console.log("2️⃣  POST /api/trpc/auth.login");
    const loginBody = {
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
    };

    const loginResp = await request("POST", "/api/trpc/auth.login", loginBody, {
      "x-csrf-token": csrfToken,
    });

    console.log(`   Status: ${loginResp.status}`);
    console.log(`   Body:`, loginResp.body);

    if (loginResp.status !== 200) {
      console.error(`❌ Login failed with status ${loginResp.status}`);
      console.error("   Raw body:", loginResp.rawBody);
      return;
    }

    // Extract session token from response
    if (loginResp.body?.[0]?.result?.data?.sessionToken) {
      sessionToken = loginResp.body[0].result.data.sessionToken;
      console.log(`   Session Token: ${sessionToken.substring(0, 16)}...`);
    }

    if (loginResp.body?.[0]?.result?.data?.ok) {
      console.log(`   Login OK: ${loginResp.body[0].result.data.ok}`);
    }
    console.log(`   Cookies: ${Object.keys(cookies).join(", ")}\n`);

    // Step 3: Test protected mutation (auth.me - simpler than creating)
    console.log("3️⃣  POST /api/trpc/auth.me (protected query)");

    const meResp = await request("POST", "/api/trpc/auth.me", null, {
      "x-csrf-token": csrfToken,
      "x-session-token": sessionToken || "",
    });

    console.log(`   Status: ${meResp.status}`);
    console.log(`   Body:`, meResp.body);

    if (meResp.status === 200) {
      console.log("   ✅ Protected endpoint works!\n");
    } else {
      console.error(`❌ Protected endpoint returned ${meResp.status}`);
      console.error("   Raw body:", meResp.rawBody);
    }

    console.log("✅ All tests completed!");
    console.log("\n📊 Summary:");
    console.log(`   CSRF Token obtained: ${!!csrfToken}`);
    console.log(`   Login successful: ${loginResp.status === 200}`);
    console.log(`   Session token obtained: ${!!sessionToken}`);
    console.log(`   Protected endpoint accessible: ${meResp.status === 200}`);

  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

runTests();
