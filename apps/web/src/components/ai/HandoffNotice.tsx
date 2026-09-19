'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
export default function HandoffNotice(){
 const [present,setPresent]=useState(false);
 useEffect(()=>{let live=true;fetch('/api/ai/simulator').then(r=>r.json()).then(d=>{if(live)setPresent(!!d.draft);}).catch(()=>{});return()=>{live=false;};},[]);
 return present?<p className="notice"><Link href="/simulador">Tienes un borrador conservado en el simulador. Volver para revisarlo y continuar →</Link></p>:null;
}
