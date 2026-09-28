import pg from 'pg';
import {assertDatabaseEnvironment,assertOrigins} from '../environment-config.mjs';
import {migrate} from './migrate.mjs';
// Explicit nonproduction migration authority only; never read .env files or app URL fallbacks.
if (process.env.APP_ENVIRONMENT !== 'preview' || process.argv[2] !== '--apply') throw Error('Explicit preview --apply required');
assertOrigins();
const connectionString=process.env.STAGING_MIGRATION_DATABASE_URL || '';
assertDatabaseEnvironment(connectionString);
const pool=new pg.Pool({connectionString:connectionString.split('?')[0],ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:5000,statement_timeout:60000});
try { await migrate(pool); console.log('Preview migrations applied/verified. Provider certification still required.'); }
catch { console.error('Preview migration failed. No credentials or raw server error printed. Review protected database logs.'); process.exitCode=1; }
finally { await pool.end(); }
