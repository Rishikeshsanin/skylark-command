import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const notes = [];

function fail(message, data) {
  failures.push({ message, ...(data ? { data } : {}) });
}

function note(message, data) {
  notes.push({ message, ...(data ? { data } : {}) });
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

const files = trackedFiles();
const textFiles = [];
for (const file of files) {
  const fullPath = path.join(root, file);
  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 2_000_000) continue;
  const extension = path.extname(file).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".woff", ".woff2"].includes(extension)) continue;
  const buffer = fs.readFileSync(fullPath);
  if (buffer.includes(0)) continue;
  textFiles.push({ file, text: buffer.toString("utf8") });
}

// ---------------------------------------------------------------------------
// Migration order and production guardrails.
// ---------------------------------------------------------------------------
const expectedMigrationFiles = [
  "001_temporal_intelligence.sql",
  "002_temporal_production_hardening.sql",
  "003_identity_workspace_rbac.sql",
];
const expectedMigrationVersions = expectedMigrationFiles.map((file) => file.replace(/\.sql$/, ""));
const migrationsDir = path.join(root, "src", "lib", "data-platform", "migrations");
const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
if (JSON.stringify(migrationFiles) !== JSON.stringify(expectedMigrationFiles)) {
  fail("Canonical migration file order does not match 001/002/003.", { migrationFiles });
}
if (new Set(migrationFiles.map((file) => file.split("_")[0])).size !== migrationFiles.length) {
  fail("Duplicate migration numeric IDs detected.", { migrationFiles });
}
if (migrationFiles.some((file) => /^002_identity_.*workspace_rbac\.sql$/.test(file))) {
  fail("Stale auth/RBAC migration occupies migration 002.", { migrationFiles });
}

const migrationRegistry = read("src/lib/data-platform/migrate.ts");
const registeredVersions = [...migrationRegistry.matchAll(/version:\s*"([^"]+)"/g)].map((match) => match[1]);
const registeredFiles = [...migrationRegistry.matchAll(/file:\s*"([^"]+)"/g)].map((match) => match[1]);
if (JSON.stringify(registeredVersions) !== JSON.stringify(expectedMigrationVersions)) {
  fail("Migration registry version order does not match canonical 001/002/003 order.", { registeredVersions });
}
if (JSON.stringify(registeredFiles) !== JSON.stringify(expectedMigrationFiles)) {
  fail("Migration registry file order does not match canonical 001/002/003 order.", { registeredFiles });
}
if (!migrationRegistry.includes("checksumMigration") || !migrationRegistry.includes("checksum mismatch")) {
  fail("Migration checksum/drift protection is missing from the migration runner.");
}

const temporalHardening = read("src/lib/data-platform/migrations/002_temporal_production_hardening.sql");
if (!temporalHardening.includes("CREATE UNIQUE INDEX IF NOT EXISTS sync_runs_workspace_active_idx")) {
  fail("One-active-sync unique index is missing from temporal production migration.");
}
if (!temporalHardening.includes("WHERE status = 'syncing'")) {
  fail("One-active-sync index is not restricted to active syncing rows.");
}

// ---------------------------------------------------------------------------
// Merge-marker and tracked-secret sweep.
// Markdown fenced examples are documentation, not unresolved conflict state.
// ---------------------------------------------------------------------------
const markerPattern = /^(?:<{7}|={7}|>{7})(?: .*)?$/m;
for (const { file, text } of textFiles) {
  const markerScanText = file.endsWith(".md") ? text.replace(/```[\s\S]*?```/g, "") : text;
  if (markerPattern.test(markerScanText)) fail("Unresolved merge marker detected.", { file });
}

const envFiles = files.filter((file) => path.basename(file).startsWith(".env"));
for (const file of envFiles) {
  if (file !== ".env.example") fail("Unexpected tracked environment file detected.", { file });
}

const envExample = read(".env.example");
const sensitiveEnvNames = [
  "MONDAY_API_TOKEN",
  "DATABASE_URL",
  "CRON_SECRET",
  "GEMINI_API_KEY",
  "AI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
for (const name of sensitiveEnvNames) {
  const match = envExample.match(new RegExp(`^${name}=([^\\r\\n]*)$`, "m"));
  if (match && match[1].trim() !== "") fail(".env.example contains a non-empty sensitive value.", { name });
}

const literalSecretPatterns = [
  { label: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "GitHub token", regex: /\b(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/ },
  { label: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{25,}\b/ },
  { label: "OpenAI-style secret key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "Supabase secret key", regex: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/ },
  { label: "Supabase publishable key", regex: /\bsb_publishable_[A-Za-z0-9_-]{20,}\b/ },
];
for (const { file, text } of textFiles) {
  for (const pattern of literalSecretPatterns) {
    if (pattern.regex.test(text)) fail(`Possible committed ${pattern.label} detected.`, { file });
  }
  if (/NEXT_PUBLIC_[A-Z0-9_]*(?:TOKEN|SECRET|DATABASE|SERVICE_ROLE|MONDAY|GEMINI)/.test(text)) {
    fail("Sensitive credential family exposed through NEXT_PUBLIC_ naming.", { file });
  }
}

const namedSecretAssignment = /\b(MONDAY_API_TOKEN|DATABASE_URL|CRON_SECRET|GEMINI_API_KEY|AI_API_KEY|SUPABASE_(?:URL|PUBLISHABLE_KEY|SECRET_KEY|SERVICE_ROLE_KEY))\b\s*[:=]\s*["'`]([^"'`\n]+)["'`]/g;
for (const { file, text } of textFiles) {
  for (const match of text.matchAll(namedSecretAssignment)) {
    const value = match[2].trim();
    const allowedFixture = value === "qa-read-only-browser-fixture";
    const placeholder = /^(?:process\.env\.|<|\$\{|example|placeholder|test-|qa-|your-)/i.test(value);
    if (!allowedFixture && !placeholder) {
      fail("Possible hard-coded named credential detected.", { file, name: match[1] });
    }
  }
}

// ---------------------------------------------------------------------------
// API/security boundary static checks. Behavioral tests provide the deeper proof.
// ---------------------------------------------------------------------------
const apiFiles = textFiles.filter(({ file }) => file.startsWith("src/app/api/") && /\.(?:ts|tsx|js|mjs)$/.test(file));
for (const { file, text } of apiFiles) {
  if (/\.unsafe\s*\(/.test(text) || /\bsql\s*`/.test(text)) {
    fail("Direct/raw SQL execution found in an API route.", { file });
  }
  if (/request\.(?:json|text)\(\)[\s\S]{0,250}(?:graphql|query\s*:)/i.test(text)) {
    fail("Potential arbitrary GraphQL request surface found in an API route.", { file });
  }
}

const mondayClient = read("src/lib/monday/client.ts");
if (
  !mondayClient.includes("function assertReadOnlyQuery") ||
  !mondayClient.includes("mutation") ||
  !mondayClient.includes("READ_ONLY_VIOLATION") ||
  !mondayClient.includes("assertReadOnlyQuery(query)")
) {
  fail("monday.com read-only mutation rejection guard is missing.");
}

const syncRoute = read("src/app/api/internal/sync/monday/route.ts");
if (!syncRoute.includes("process.env.CRON_SECRET") || !syncRoute.includes("authorization")) {
  fail("Temporal sync route is missing internal bearer authorization.");
}
const diagnosticsRoute = read("src/app/api/internal/diagnostics/route.ts");
if (!diagnosticsRoute.includes("process.env.CRON_SECRET") || !diagnosticsRoute.includes("authorization")) {
  fail("Diagnostics route is missing internal bearer authorization.");
}

for (const { file, text } of textFiles.filter(({ file }) => file.startsWith("src/"))) {
  if (/console\.(?:log|info|warn|error)\([^\n]*(?:authorization|headers\.get\(["']authorization)/i.test(text)) {
    fail("Possible raw Authorization logging detected.", { file });
  }
  if (/(?:console\.(?:log|info|warn|error)|logEvent)\([^\n]*(?:body\.message|userPrompt|promptText)/i.test(text)) {
    fail("Possible raw prompt logging detected.", { file });
  }
}

const logger = read("src/lib/server/logger.ts");
for (const required of ["authorization", "cookie", "token", "credential"]) {
  if (!logger.toLowerCase().includes(required)) {
    fail("Logger redaction contract is missing a sensitive-key family.", { required });
  }
}

note("Migration order", expectedMigrationVersions);
note("Tracked text files scanned", textFiles.length);
note("Tracked env files", envFiles);

console.log(JSON.stringify({ ok: failures.length === 0, failures, notes }, null, 2));
if (failures.length > 0) process.exitCode = 1;
