import fs from "node:fs/promises";
import crypto from "node:crypto";
import pg from "pg";
import {assertLocalDatabase} from "./migrate.mjs";
const connectionString=process.env.MIGRATION_DATABASE_URL||"";
assertLocalDatabase(connectionString);
if(process.env.NODE_ENV==="production")throw new Error("Local inbox disabled in production");
const key=Buffer.from(process.env.SECURITY_DATA_KEY||"","base64");
if(key.length!==32)throw new Error("Local data key required");
const pool=new pg.Pool({connectionString});
try{
  const {rows}=await pool.query("SELECT id,payload_cipher FROM security_outbox WHERE expires_at>NOW() AND delivered_at IS NULL ORDER BY created_at");
  const messages=rows.map(row=>{
    const [iv,tag,cipher]=row.payload_cipher.split(".").map(value=>Buffer.from(value,"base64"));
    const decipher=crypto.createDecipheriv("aes-256-gcm",key,iv);decipher.setAAD(Buffer.from(`mail:${row.id}`));decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(cipher),decipher.final()]).toString("utf8"));
  });
  const destination=new URL("../../../.local/security-inbox.json",import.meta.url);
  await fs.mkdir(new URL("../../../.local/",import.meta.url),{recursive:true});
  await fs.writeFile(destination,JSON.stringify(messages,null,2),{mode:0o600});
  console.log("Local messages written to ignored .local/security-inbox.json. No email sent; protect this file as credentials.");
}finally{await pool.end();}
