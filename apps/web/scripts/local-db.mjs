import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root=fileURLToPath(new URL("../../../",import.meta.url));
const directory=path.join(root,".local","m3-postgres");
const log=path.join(root,".local","m3-postgres.log");
const env={...process.env};
for(const key of Object.keys(env))if(key.startsWith("PG"))delete env[key];
function run(command,args){
  const result=spawnSync(command,args,{env,windowsHide:true,encoding:"utf8",stdio:"ignore"});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${command} failed (exit ${result.status}); inspect .local/m3-postgres.log`);
  return result.stdout;
}
const action=process.argv[2]||"start";
if(action==="start"){
  fs.mkdirSync(path.dirname(directory),{recursive:true});
  if(!fs.existsSync(path.join(directory,"PG_VERSION")))run("initdb",["-D",directory,"-U","ticket_local","--auth=trust","--no-locale","-E","UTF8"]);
  const status=spawnSync("pg_ctl",["-D",directory,"status"],{env,windowsHide:true,encoding:"utf8",stdio:"ignore"});
  if(status.status!==0)run("pg_ctl",["-D",directory,"-l",log,"-o","-h 127.0.0.1 -p 55439 -c max_connections=30","-w","start"]);
  console.log("Disposable cluster running on 127.0.0.1:55439 (no application env files loaded).");
}else if(action==="stop"){
  run("pg_ctl",["-D",directory,"-m","fast","-w","stop"]);
  console.log("Disposable cluster stopped; local data retained.");
}else throw new Error("Expected start or stop");
