'use client';
import {useState} from 'react';
import type {Event} from '@/lib/events';
import EventDetail from '@/components/tc/EventDetail';
export default function Preview({event}:{event:Event}){const [mobile,setMobile]=useState(false);return <div className="stack"><div className="tabs"><button aria-pressed={!mobile} onClick={()=>setMobile(false)}>Escritorio</button><button aria-pressed={mobile} onClick={()=>setMobile(true)}>Móvil / 390</button></div><div className={`org-preview ${mobile?'mobile':''}`}><EventDetail event={event} preview/></div></div>;}
