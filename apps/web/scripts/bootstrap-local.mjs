import crypto from "node:crypto";
import {promisify} from "node:util";
import pg from "pg";
import {assertLocalDatabase} from "./migrate.mjs";
// Explicit loopback DB, no dotenv. Password is read from stdin, never CLI args/logs.
const connectionString=process.env.MIGRATION_DATABASE_URL||"";
assertLocalDatabase(connectionString);
if(process.env.NODE_ENV==="production")throw new Error("Local bootstrap is disabled in production");
let raw="";
for await(const chunk of process.stdin){raw+=chunk;if(raw.length>4096)throw new Error("Input too large");}
const {login,email,password,kind="ADMIN"}=JSON.parse(raw);
if(!["ADMIN","ORGANIZER"].includes(kind)||typeof login!=="string"||!login||typeof email!=="string"||!email.includes("@")||typeof password!=="string"||password.length<12||Buffer.byteLength(password)>256)throw new Error("Invalid local fixture identity");
const salt=crypto.randomBytes(16);
const hash=await promisify(crypto.scrypt)(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024});
const encoded=`scrypt-v2$131072$8$1$${salt.toString("hex")}$${hash.toString("hex")}`;
const pool=new pg.Pool({connectionString});
const client=await pool.connect();
try{
  await client.query("BEGIN");
  const id=`local_${crypto.randomUUID()}`;
  if(kind==="ADMIN")await client.query(`INSERT INTO admin_users(id,username,email,email_verified_at,password_hash,role)
    VALUES($1,$2,$3,NOW(),$4,'SUPERADMIN')`,[id,login.toLowerCase(),email.toLowerCase(),encoded]);
  else await client.query(`INSERT INTO organizer_users(id,username,email,password_hash,verified,approved)
    VALUES($1,$2,$3,$4,true,true)`,[id,login.toLowerCase(),email.toLowerCase(),encoded]);
  await client.query(`INSERT INTO security_audit(actor_kind,actor_id,action,target_type,target_id)
    VALUES('SYSTEM','local-bootstrap','identity.local_provisioned',$1,$2)`,[kind,id]);
  await client.query("COMMIT");
  console.log("Local identity created. MFA enrollment is required at first login.");
}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();await pool.end();}
