import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const require = createRequire(import.meta.url);

/** Execute actual TypeScript handlers with explicit infrastructure doubles.
 * No .env files are loaded. Missing DB/auth/email doubles fail closed.
 * Type correctness is checked separately with tsc, not transpileModule.
 */
export function loadSource(entry, overrides = {}) {
  const cache = new Map();
  const mocks = { "server-only": {}, ...overrides };
  const blocked = new Set(["@/lib/db", "@/auth", "@/lib/tickets.email"]);
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
      },
    }).outputText;
    function localRequire(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (blocked.has(specifier)) throw new Error(`Test requires an explicit double: ${specifier}`);
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/")
          ? path.join(sourceRoot, specifier.slice(2))
          : path.resolve(path.dirname(filename), specifier);
        const resolved = [base + ".ts", base + ".tsx", base].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
        if (!resolved) throw new Error(`Cannot resolve ${specifier}`);
        if (resolved === path.join(sourceRoot, "lib", "db.ts")) throw new Error("Real database prohibited in unit tests");
        return load(resolved);
      }
      return require(specifier);
    }
    const run = new vm.Script(`(function(require,module,exports){${compiled}\n})`, { filename }).runInThisContext();
    run(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return load(path.join(sourceRoot, entry));
}
