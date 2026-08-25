#!/usr/bin/env node

const rawBaseUrl = process.env.BASE_URL?.trim();

if (!rawBaseUrl) {
  console.error("[smoke] BASE_URL is required. Example: BASE_URL=https://preview.example npm run smoke");
  process.exit(2);
}

let baseUrl;
try {
  baseUrl = new URL(rawBaseUrl);
} catch {
  console.error(`[smoke] BASE_URL is not a valid URL: ${rawBaseUrl}`);
  process.exit(2);
}

if (!['http:', 'https:'].includes(baseUrl.protocol)) {
  console.error(`[smoke] BASE_URL must use http or https, received ${baseUrl.protocol}`);
  process.exit(2);
}

baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, '');

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 15_000);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error('[smoke] SMOKE_TIMEOUT_MS must be a positive number.');
  process.exit(2);
}

const allowDegradedHealth = process.env.ALLOW_DEGRADED_HEALTH === '1';
const includeChat = process.env.SMOKE_CHAT === '1';
const chatQuery = process.env.SMOKE_CHAT_QUERY?.trim() || 'What is our current open pipeline?';

const pagePaths = [
  '/',
  '/pipeline',
  '/operations',
  '/leadership',
  '/data-health',
  '/copilot',
];

const results = [];

function target(path) {
  return new URL(path, `${baseUrl.toString().replace(/\/+$/, '')}/`);
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      redirect: 'follow',
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkPage(path) {
  const url = target(path);
  const startedAt = Date.now();
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { 'user-agent': 'skylark-command-release-smoke/1.0' },
  });
  const durationMs = Date.now() - startedAt;
  const contentType = response.headers.get('content-type') || '';

  if (!response.ok) {
    throw new Error(`GET ${path} returned HTTP ${response.status}`);
  }
  if (!contentType.includes('text/html')) {
    throw new Error(`GET ${path} returned unexpected content-type: ${contentType || '<missing>'}`);
  }

  return { check: `GET ${path}`, status: response.status, durationMs };
}

async function checkHealth() {
  const path = '/api/health';
  const startedAt = Date.now();
  const response = await fetchWithTimeout(target(path), {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': 'skylark-command-release-smoke/1.0',
    },
  });
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    throw new Error(`GET ${path} returned HTTP ${response.status}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`GET ${path} did not return valid JSON`);
  }

  if (body?.service !== 'skylark-command' || body?.ok !== true) {
    throw new Error(`GET ${path} returned an unexpected health payload`);
  }

  if (!allowDegradedHealth && body.status !== 'ok') {
    throw new Error(`GET ${path} reported status=${JSON.stringify(body.status)}; production smoke requires "ok"`);
  }

  return {
    check: `GET ${path}`,
    status: response.status,
    durationMs,
    detail: `health=${body.status}`,
  };
}

async function checkChat() {
  const path = '/api/chat';
  const startedAt = Date.now();
  const response = await fetchWithTimeout(target(path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'skylark-command-release-smoke/1.0',
    },
    body: JSON.stringify({ message: chatQuery }),
  });
  const durationMs = Date.now() - startedAt;

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`POST ${path} returned HTTP ${response.status} with non-JSON body`);
  }

  if (!response.ok) {
    const code = body?.error?.code || body?.status || 'unknown';
    throw new Error(`POST ${path} returned HTTP ${response.status} (${code})`);
  }

  if (!body || typeof body !== 'object') {
    throw new Error(`POST ${path} returned an empty or invalid response envelope`);
  }

  return {
    check: `POST ${path}`,
    status: response.status,
    durationMs,
    detail: `query=${JSON.stringify(chatQuery)}`,
  };
}

async function runCheck(label, fn) {
  try {
    const result = await fn();
    results.push({ ok: true, ...result });
    console.log(`[smoke] PASS ${result.check} -> ${result.status} (${result.durationMs}ms)${result.detail ? ` ${result.detail}` : ''}`);
  } catch (error) {
    const message = error instanceof Error
      ? error.name === 'AbortError'
        ? `${label} timed out after ${timeoutMs}ms`
        : error.message
      : String(error);
    results.push({ ok: false, check: label, error: message });
    console.error(`[smoke] FAIL ${label}: ${message}`);
  }
}

for (const path of pagePaths) {
  await runCheck(`GET ${path}`, () => checkPage(path));
}

await runCheck('GET /api/health', checkHealth);

if (includeChat) {
  await runCheck('POST /api/chat', checkChat);
} else {
  console.log('[smoke] SKIP POST /api/chat (set SMOKE_CHAT=1 to enable the safe chat check)');
}

const failed = results.filter((result) => !result.ok);
console.log(`[smoke] Completed ${results.length} checks: ${results.length - failed.length} passed, ${failed.length} failed.`);

if (failed.length > 0) {
  process.exit(1);
}
