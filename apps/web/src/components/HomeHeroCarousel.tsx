"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Event } from "@/lib/events";

type Props = {
  events: Event[];
  intervalMs?: number;
  fullBleed?: boolean; // ✅ full ancho tipo Passline
};

export default function HomeHeroCarousel({
  events,
  intervalMs = 10000,
  fullBleed = false,
}: Props) {
  const safeEvents = (events ?? []).filter(Boolean);
  const hasMany = safeEvents.length > 1;

  const slides = useMemo(() => {
    if (safeEvents.length === 0) return [];
    if (!hasMany) return safeEvents;
    return [...safeEvents, safeEvents[0]];
  }, [safeEvents, hasMany]);

  const [index, setIndex] = useState(0);
  const [transitionOn, setTransitionOn] = useState(true);

  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    setIndex(0);
    setTransitionOn(true);
  }, [safeEvents.length]);

  useEffect(() => {
    if (!hasMany) return;
    const id = window.setInterval(() => setIndex((i) => i + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [hasMany, intervalMs]);

  function onTransitionEnd() {
    if (!hasMany) return;

    if (indexRef.current === safeEvents.length) {
      setTransitionOn(false);
      setIndex(0);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTransitionOn(true));
      });
    }
  }

  if (slides.length === 0) {
    return <div className="w-full bg-white/5 aspect-[800/400] md:aspect-[1400/450]" />;
  }

  const trackStyle: React.CSSProperties = {
    transform: `translate3d(-${index * 100}%, 0, 0)`,
    transition: transitionOn ? "transform 900ms cubic-bezier(0.2, 0.9, 0.2, 1)" : "none",
  };

  const FullBleedWrap = ({ children }: { children: React.ReactNode }) => {
    if (!fullBleed) return <>{children}</>;
    // ✅ rompe el max-w del layout y queda 100% viewport
    return (
      <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen">
        {children}
      </div>
    );
  };

  return (
    <FullBleedWrap>
      {/* ✅ sin marco: sin border, sin padding, sin rounded */}
      <section className="w-full">
        <div className="relative overflow-hidden">
          <div className="flex w-full" style={trackStyle} onTransitionEnd={onTransitionEnd}>
            {slides.map((e, i) => {
              const hero = (e as any)?.hero;
              const desktopSrc =
                hero?.desktop ||
                (e as any)?.image ||
                "https://images.pexels.com/photos/1763075/pexels-photo-1763075.jpeg?auto=compress&cs=tinysrgb&w=1800";

              const mobileSrc = hero?.mobile || desktopSrc;

              return (
                <div key={`${e.id}_${i}`} className="w-full shrink-0">
                  <Link
                    href={`/eventos/${e.slug}`}
                    aria-label={`Ver evento: ${e.title}`}
                    className="block w-full"
                  >
                    {/* ✅ cambian dimensiones reales según breakpoint */}
                    <div className="relative w-full aspect-[800/400] md:aspect-[1400/450]">
                      <picture>
                        <source media="(max-width: 767px)" srcSet={mobileSrc} />
                        <img
                          src={desktopSrc}
                          alt={e.title}
                          className="absolute inset-0 h-full w-full object-cover"
                          loading={i === 0 ? "eager" : "lazy"}
                          draggable={false}
                        />
                      </picture>

                      {/* overlay suave (no tapa clicks) */}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </FullBleedWrap>
  );
}
