import fs from 'node:fs/promises';
import sharp from 'sharp';
import {loadSource} from '../tests/load-source.mjs';
const {imageVariants}=loadSource('lib/media-storage.server.ts');
// Local input only; no environment files, credentials or external URLs.
const source=await fs.readFile('public/events/noche-rock.jpg');
const input=await sharp(source).resize(4000,3000,{fit:'cover'}).jpeg({quality:94}).toBuffer();
let peak=process.memoryUsage().rss;const before=peak,start=performance.now();
const sample=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},5);
let variants;
try{variants=await imageVariants(input,'image/jpeg');}finally{clearInterval(sample);}
peak=Math.max(peak,process.memoryUsage().rss);
const result={input:{bytes:input.length,width:4000,height:3000},processingMs:Math.round(performance.now()-start),rssBefore:before,rssPeak:peak,rssDelta:peak-before,
 variants:variants.map(v=>({name:v.name,width:v.width,height:v.height,bytes:v.bytes.length})),limits:{inputBytes:5242880,pixels:24000000,parallelPerProcess:2},
 method:'One 12MP JPEG generated from repository photography; RSS sampled every 5ms in a separate Node process. Includes Sharp native memory. Not a sustained load benchmark or hosting budget.',
 limitations:'Local CPU/storage only. No network, S3 connectivity, CDN latency or production LCP measured.'};
await fs.mkdir('../../docs/03-implementation/qa/m12',{recursive:true});await fs.writeFile('../../docs/03-implementation/qa/m12/image-performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
