import { Suspense } from "react";
import SecurityForm from "./ui";
export default function SecurityPage(){return <Suspense fallback={<p>Cargando...</p>}><SecurityForm /></Suspense>;}
