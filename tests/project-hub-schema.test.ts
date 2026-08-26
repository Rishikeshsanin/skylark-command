import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("Project Hub database connections are pinned to the Skylark schema", async () => {
  const source = await readFile(join(process.cwd(), "src/lib/data-platform/postgres.ts"), "utf8");

  assert.match(source, /SKYLARK_DATABASE_SEARCH_PATH\s*=\s*"skylark_command,pg_catalog"/);
  assert.match(source, /search_path:\s*SKYLARK_DATABASE_SEARCH_PATH/);
  assert.match(source, /application_name:\s*"skylark-command"/);
  assert.doesNotMatch(source, /search_path:\s*["']public/);
});
