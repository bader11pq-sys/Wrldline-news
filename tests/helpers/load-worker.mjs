/* Loads the Cloudflare module worker in Node.
 *
 * The worker is ESM, but the repository is CommonJS by default, so a direct
 * import would parse .js as CJS. A data: URL avoided that but forbade relative
 * imports, which the worker now needs (it reads the generated section registry).
 * Copying the worker plus its generated registry into a temporary ESM package
 * keeps relative specifiers working and still isolates every test run.
 */
import { mkdtemp, cp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function loadWorkerModule(workerDir, entry = "worker.js") {
  const dir = await mkdtemp(join(tmpdir(), "wrldline-worker-"));
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  await cp(workerDir, dir, { recursive: true });
  return import(pathToFileURL(join(dir, entry)).href + "?t=" + Date.now());
}
