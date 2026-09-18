import pg from "pg";
import { migrate } from "../scripts/migrate.mjs";
// Fixed disposable loopback cluster, never application environment variables.
export async function localDatabase({applyMigrations=true}={}) {
  const config={host:"127.0.0.1",port:55439,user:"ticket_local",connectionTimeoutMillis:3000};
  const root=new pg.Pool({...config,database:"postgres"});
  const database=`ticketchile_test_m3_${Date.now()}_${Math.floor(Math.random()*100000)}`;
  try {await root.query(`CREATE DATABASE ${database}`);} finally {await root.end();}
  const pool=new pg.Pool({...config,database,max:8});
  try {if(applyMigrations)await migrate(pool);}catch(error){await pool.end();throw error;}
  const withTx=async fn=>{
    const client=await pool.connect();
    try {await client.query("BEGIN");const result=await fn(client);await client.query("COMMIT");return result;}
    catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
  };
  return {pool,withTx,database};
}
