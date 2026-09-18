import {execFileSync,spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../../",import.meta.url));
const cwd=fileURLToPath(new URL("../",import.meta.url));
const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",windowsHide:true}).trim().split(/\r?\n/);
const files=[...new Set([...git(["-c","core.safecrlf=false","diff","--name-only","--diff-filter=ACMR","HEAD","--","apps/web"]),
  ...git(["ls-files","--others","--exclude-standard","--","apps/web"])])]
  .filter(file=>/\.(ts|tsx|mjs)$/.test(file)).map(file=>file.slice("apps/web/".length));
if(!files.length)throw new Error("No changed JavaScript/TypeScript files to lint");
console.log(`Linting ${files.length} changed/new files from the root repository.`);
const result=spawnSync(process.execPath,["node_modules/eslint/bin/eslint.js","--max-warnings","0",...files],{cwd,stdio:"inherit",windowsHide:true});
if(result.error)throw result.error;
process.exit(result.status??1);
