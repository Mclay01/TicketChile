import pg from 'pg';
import fs from 'node:fs/promises';
import {assertLocalDatabase} from './migrate.mjs';
import {loadSource} from '../tests/load-source.mjs';
// A guarded local rehearsal harness. Production calls the internal server services
// from its private worker runtime; this CLI intentionally cannot reach remote DBs.
const args=process.argv.slice(2),mode=args.shift()||'adopt';
if(!['adopt','cleanup'].includes(mode)||args.some(a=>!/^--(apply|limit=\d+|cursor=[A-Za-z0-9_-]+|checkpoint=[A-Za-z0-9_-]+)$/.test(a)))throw Error('Usage: media-local.mjs adopt|cleanup [--apply] [--limit=10] [--cursor=...] [--checkpoint=name]');
const connectionString=process.env.MIGRATION_DATABASE_URL||'';assertLocalDatabase(connectionString);
if(process.env.MEDIA_PROVIDER && process.env.MEDIA_PROVIDER!=='local')throw Error('Local rehearsal permits local storage only');
if(process.env.NODE_ENV==='production')throw Error('Local rehearsal only');
process.env.MEDIA_PROVIDER='local';
const pool=new pg.Pool({connectionString}),withTx=async run=>{const c=await pool.connect();try{await c.query('BEGIN');const value=await run(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
const limit=Number(args.find(a=>a.startsWith('--limit='))?.split('=')[1]||10),checkpoint=args.find(a=>a.startsWith('--checkpoint='))?.split('=')[1];
const file=checkpoint?`.local/media-checkpoint-${checkpoint}.json`:null;
let cursor=args.find(a=>a.startsWith('--cursor='))?.split('=')[1]||'';
if(file&&!cursor){try{const saved=JSON.parse(await fs.readFile(file,'utf8'));if(saved.database!==new URL(connectionString).pathname||saved.dryRun!==!args.includes('--apply'))throw Error('Checkpoint environment/mode mismatch');cursor=saved.nextCursor||'';}catch(e){if(e.code!=='ENOENT')throw e;}}
try{
 const overrides={'@/lib/db':{pool,withTx}};
 if(mode==='cleanup'){
  if(!args.includes('--apply'))throw Error('Cleanup requires --apply on this guarded local database');
  console.log(JSON.stringify(await loadSource('lib/media-lifecycle.server.ts',overrides).cleanupMedia({limit})));
 }else{
  const result=await loadSource('lib/media-adoption.server.ts',overrides).adoptLegacyMedia({dryRun:!args.includes('--apply'),limit,cursor});
  console.log(JSON.stringify(result));
  if(file){await fs.mkdir('.local',{recursive:true});await fs.writeFile(file,JSON.stringify({...result,database:new URL(connectionString).pathname}));}
 }
}finally{await pool.end();}
