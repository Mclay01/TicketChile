import { Suspense } from 'react';
import Verify from './ui';
export default function Page(){return <Suspense fallback={<p role="status">Cargando…</p>}><Verify /></Suspense>;}
