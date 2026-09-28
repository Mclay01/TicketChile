"use client";
import Recovery from "@/components/tc/Recovery";
export default function ErrorPage({reset}:{reset:()=>void}) { return <Recovery href="/admin" reset={reset} />; }
