"use client";

import { useEffect, useMemo, useState } from "react";
import HeroBanner from "@/components/HeroBanner";

type HeroItem = {
  href: string;
  desktopSrc: string;
  mobileSrc: string;
  alt: string;
};

type Props = {
  items: HeroItem[];
  intervalMs?: number;
};

export default function HomeHeroRotator({
  items,
  intervalMs = 4000,
}: Props) {
  const safeItems = useMemo(() => items.filter(Boolean), [items]);
  const [index, setIndex] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (safeItems.length <= 1) return;

    const id = window.setInterval(() => {
      setIsFading(true);

      window.setTimeout(() => {
        setIndex((prev) => {
          const next = (prev + 1) % safeItems.length;
          setVisibleIndex(next);
          return next;
        });

        setIsFading(false);
      }, 220);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [safeItems.length, intervalMs]);

  useEffect(() => {
    setVisibleIndex(index);
  }, [index]);

  if (!safeItems.length) return null;

  const current = safeItems[visibleIndex];

  return (
    <div className="relative">
      <div
        className={[
          "transition-opacity duration-500 ease-out",
          isFading ? "opacity-85" : "opacity-100",
        ].join(" ")}
      >
        <HeroBanner
          href={current.href}
          desktopSrc={current.desktopSrc}
          mobileSrc={current.mobileSrc}
          alt={current.alt}
          fullBleed
          priority
          height={{ base: 260, md: 360, lg: 420 }}
        />
      </div>

      {safeItems.length > 1 ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          {safeItems.map((_, i) => (
            <span
              key={i}
              className={[
                "h-2.5 rounded-full transition-all duration-300",
                i === visibleIndex ? "w-6 bg-white" : "w-2.5 bg-white/45",
              ].join(" ")}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}