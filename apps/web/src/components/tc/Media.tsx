"use client";
import Image, { getImageProps } from "next/image";
import { useState } from "react";
import { MEDIA_FALLBACK, mediaSource } from "@/lib/media";
export default function Media({ src, mobileSrc, alt, priority = false, sizes = "(max-width: 800px) 50vw, 25vw", className = "" }: { src: string; mobileSrc?: string; alt: string; priority?: boolean; sizes?: string; className?: string }) {
  const [failedSource, setFailed] = useState('');
  const failed = failedSource === `${src}|${mobileSrc || ''}`;
  const source = failed ? MEDIA_FALLBACK : mediaSource(src);
  const mobile = mediaSource(mobileSrc);
  const mobileProps = mobileSrc && !failed ? getImageProps({ src: mobile, alt, width: 800, height: 600, sizes: "100vw", unoptimized: mobile.startsWith("data:") || mobile.startsWith("/api/") }).props : null;
  const variants = /^\/api\/media\/[a-f0-9-]{36}$/.test(source);
  const mobileVariants = /^\/api\/media\/[a-f0-9-]{36}$/.test(mobile);
  // Fixed variants avoid fictitious width descriptors for small/portrait uploads.
  // Eager/high on the actual picture hero avoids preloading the unused desktop source.
  return <div className={`media ${className}`}><picture>{mobileProps && <source media="(max-width: 800px)" srcSet={mobileVariants ? `${mobile}?variant=card` : mobileProps.srcSet || mobileProps.src} sizes="100vw" />}{variants && priority && <source media="(max-width: 800px)" srcSet={`${source}?variant=card`}/>}<Image src={variants ? `${source}?variant=${priority?'hero':sizes==='240px'?'thumb':'card'}` : source} alt={alt} fill sizes={sizes} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':undefined} unoptimized={source.startsWith("data:") || source.startsWith("/api/")} onError={() => setFailed(`${src}|${mobileSrc || ''}`)} /></picture></div>;
}
