import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mediaConfig,mediaImageOrigin} from '../media-config.mjs';
import {loadSource} from './load-source.mjs';
const storage=loadSource('lib/media-storage.server.ts');
const environment={NODE_ENV:'production',APP_ENVIRONMENT:'preview',MEDIA_PROVIDER:'s3',MEDIA_ENVIRONMENT:'preview',MEDIA_S3_BUCKET:'ticketchile-preview-contract',MEDIA_S3_REGION:'us-east-1',MEDIA_S3_ACCESS_KEY_ID:'synthetic',MEDIA_S3_SECRET_ACCESS_KEY:'synthetic-not-a-secret'};
test('media configuration defaults to disabled in production and isolates preview buckets and namespaces',()=>{
 assert.equal(mediaConfig({NODE_ENV:'production'}).provider,'disabled');
 assert.equal(mediaConfig({NODE_ENV:'development'}).provider,'local');
 assert.throws(()=>mediaConfig({NODE_ENV:'production',MEDIA_PROVIDER:'local'}));
 const c=mediaConfig(environment);assert.equal(c.namespace,'preview/v1');assert.equal(c.bucket,'ticketchile-preview-contract');
 for(const change of [{MEDIA_S3_BUCKET:'ticketchile-production-assets'},{VERCEL_ENV:'production'},{APP_ENVIRONMENT:'production'},{MEDIA_S3_ACCESS_KEY_ID:''},{MEDIA_PROVIDER:'unknown'},{MEDIA_MAX_BYTES:'5242881'},{MEDIA_GRACE_HOURS:'1'}])assert.throws(()=>mediaConfig({...environment,...change}));
});
test('S3 delivery origin and CSP configuration reject wildcards, credentials, paths and insecure endpoints',()=>{
 for(const endpoint of ['http://objects.test','https://*.objects.test','https://user:password@objects.test','https://objects.test/path','https://objects.test/?query=x','https://127.0.0.1'])assert.equal(mediaImageOrigin({...environment,MEDIA_S3_ENDPOINT:endpoint}),'');
 assert.equal(mediaImageOrigin({...environment,MEDIA_S3_ENDPOINT:'https://objects.example.test'}),'https://objects.example.test');
 assert.equal(mediaImageOrigin({...environment,MEDIA_S3_SECRET_ACCESS_KEY:''}),'');
});
test('S3 adapter puts immutable checksummed WebP, heads metadata and performs idempotent deletes under its namespace',async()=>{
 const {s3MediaStore}=loadSource('lib/media-s3.server.ts'),commands=[];
 const c=mediaConfig(environment),key=`preview/v1/${'a'.repeat(24)}/${'b'.repeat(24)}/POSTER/11111111-1111-4111-8111-111111111111/hero.webp`;
 const client={send:async command=>{commands.push(command);if(command.constructor.name==='HeadObjectCommand')return {ContentLength:3,ContentType:'image/webp',Metadata:{sha256:'known'}};return {};}};
 const store=s3MediaStore(c,client);await store.put(key,Buffer.from('abc'));
 assert.equal(commands[0].input.IfNoneMatch,'*');assert.equal(commands[0].input.ACL,undefined);assert.equal(commands[0].input.CacheControl,'private, no-store');assert.equal(commands[0].input.Metadata.sha256,storage.checksum('abc'));
 assert.equal((await store.head(key)).bytes,3);await store.delete(key);assert.equal(commands.at(-1).constructor.name,'DeleteObjectCommand');
 await assert.rejects(store.put(key.replace('preview/','production/'),Buffer.from('abc')));await assert.rejects(store.get('../secret'));
 const absent=s3MediaStore(c,{send:async()=>{throw {$metadata:{httpStatusCode:404}};}});assert.equal(await absent.head(key),null);
 const denied=s3MediaStore(c,{send:async()=>{throw {$metadata:{httpStatusCode:403}};}});await assert.rejects(denied.head(key));
});
test('S3 signed read URLs use only the configured origin, expire in 60 seconds and keep drafts private without network I/O',async()=>{
 const {s3MediaStore}=loadSource('lib/media-s3.server.ts'),c=mediaConfig(environment);
 const key=`preview/v1/${'a'.repeat(24)}/${'b'.repeat(24)}/POSTER/11111111-1111-4111-8111-111111111111/hero.webp`;
 for(const published of [true,false]){
  const url=new URL(await s3MediaStore(c).readUrl(key,published));assert.equal(url.origin,c.origin);assert.equal(url.searchParams.get('X-Amz-Expires'),'60');assert.equal(url.searchParams.get('response-cache-control'),published?'public, max-age=60':'private, no-store');
 }
});
test('decoded content must match declared MIME regardless of file extension; variants strip EXIF and bound bytes/dimensions',async()=>{
 const bytes=await sharp({create:{width:2600,height:1600,channels:3,background:'blue'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 await assert.rejects(storage.imageVariants(bytes,'image/png'),{status:400});
 const variants=await storage.imageVariants(bytes,'image/jpeg');assert.equal(variants.length,3);
 for(const [i,v]of variants.entries()){const meta=await sharp(v.bytes).metadata();assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);assert.equal(meta.icc,undefined);assert.ok(Math.max(meta.width,meta.height)<=[2400,960,320][i]);assert.equal(v.checksum,storage.checksum(v.bytes));}
 assert.ok(variants[0].height>variants[0].width);
});
test('decoder refuses animated images, oversized dimensions, malformed content and executable file disguises',async()=>{
 const huge=await sharp({create:{width:16001,height:1,channels:3,background:'red'}}).png().toBuffer();
 const animation=await sharp(Buffer.concat([Buffer.alloc(300,0),Buffer.alloc(300,255)]),{raw:{width:10,height:20,channels:3,pageHeight:10}}).webp({loop:0,delay:[100,100]}).toBuffer();
 assert.equal((await sharp(animation).metadata()).pages,2);
 for(const bytes of [huge,animation,Buffer.from('%PDF-1.0'),Buffer.from('<svg/>'),Buffer.from([0xff,0xd8,0xff])])await assert.rejects(storage.normalizeImage(bytes),{status:400});
});
test('processing admission bounds concurrent decoder memory and recovers after work finishes',async()=>{
 const bytes=await sharp({create:{width:2000,height:1500,channels:3,background:'red'}}).png().toBuffer();
 const previous=process.env.MEDIA_PROCESSING_CONCURRENCY;process.env.MEDIA_PROCESSING_CONCURRENCY='1';
 try{const first=storage.imageVariants(bytes,'image/png');await assert.rejects(storage.imageVariants(bytes,'image/png'),{code:'MEDIA_BUSY'});await first;assert.equal((await storage.imageVariants(bytes,'image/png')).length,3);}
 finally{if(previous===undefined)delete process.env.MEDIA_PROCESSING_CONCURRENCY;else process.env.MEDIA_PROCESSING_CONCURRENCY=previous;}
});
test('disabled adapter fails closed without creating a local or remote client',()=>{
 const previous=process.env.MEDIA_PROVIDER;process.env.MEDIA_PROVIDER='disabled';
 try{assert.throws(()=>storage.mediaStore(),{status:503});}finally{if(previous===undefined)delete process.env.MEDIA_PROVIDER;else process.env.MEDIA_PROVIDER=previous;}
});
