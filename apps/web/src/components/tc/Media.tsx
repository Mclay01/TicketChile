"use client";
import Image, { getImageProps } from "next/image";
import { useState } from "react";
import { MEDIA_FALLBACK, mediaSource } from "@/lib/media";
export default function Media({ src, mobileSrc, alt, priority = false, sizes = "(max-width: 800px) 50vw, 25vw", className = "" }: { src: string; mobileSrc?: string; alt: string; priority?: boolean; sizes?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? MEDIA_FALLBACK : mediaSource(src);
  const mobile = mediaSource(mobileSrc);
  const mobileProps = mobileSrc && !failed ? getImageProps({ src: mobile, alt, width: 800, height: 600, sizes: "100vw", unoptimized: mobile.startsWith("data:") || mobile.startsWith("/api/") }).props : null;
  return <div className={`media ${className}`}><picture>{mobileProps && <source media="(max-width: 800px)" srcSet={mobileProps.srcSet || mobileProps.src} sizes="100vw" />}<Image src={source} alt={alt} fill sizes={sizes} priority={priority} unoptimized={source.startsWith("data:") || source.startsWith("/api/")} onError={() => setFailed(true)} /></picture></div>;
}
