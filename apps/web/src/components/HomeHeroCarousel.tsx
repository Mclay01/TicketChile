"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Event } from "@/lib/events";

type Props = {
  events: Event[];
  intervalMs?: number; // si no lo pasas, usamos un default más lento
};

export default function HomeHeroCarousel({
  events,
  intervalMs = 10000, // ✅ más tiempo por banner (10s)
}: Props) {
  const safeEvents = (events ?? []).filter(Boolean);
  const hasMany = safeEvents.length > 1;

  const slides = useMemo(() => {
    if (safeEvents.length === 0) return [];
    if (!hasMany) return safeEvents;
    // ✅ clonamos el primero al final para loop sin “volver hacia atrás”
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

  // ✅ autoplay cada N ms (NO se pausa al hover)
  useEffect(() => {
    if (!hasMany) return;

    const id = window.setInterval(() => {
      setIndex((i) => i + 1);
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [hasMany, intervalMs]);

  // ✅ cuando llega al clon, salta al real sin transición
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
    return (
      <section className="rounded-[32px] border border-white/10 bg-white/5 p-1">
        <div className="h-[300px] md:h-[360px] lg:h-[420px] rounded-[28px] bg-white/5" />
      </section>
    );
  }

  const trackStyle: React.CSSProperties = {
    transform: `translate3d(-${index * 100}%, 0, 0)`,
    transition: transitionOn
      ? "transform 900ms cubic-bezier(0.2, 0.9, 0.2, 1)"
      : "none",
  };

  return (
    // ✅ FULL BLEED: ocupa todo el ancho de la página sin borde/marco
    <section className="-mx-6 md:-mx-10">
      <div className="relative overflow-hidden">
        <div
          className="flex w-full"
          style={trackStyle}
          onTransitionEnd={onTransitionEnd}
        >
          {slides.map((e, i) => {
            const desktopSrc =
              (e as any)?.bannerDesktop ||
              (e as any)?.image ||
              "/events/fiesta-verano.jpg";

            const mobileSrc =
              (e as any)?.bannerMobile ||
              (e as any)?.bannerDesktop ||
              desktopSrc;

            return (
              <div key={`${e.id}_${i}`} className="w-full shrink-0">
                <Link
                  href={`/eventos/${e.slug}`}
                  aria-label={`Ver evento: ${e.title}`}
                  className="block h-full w-full"
                >
                  {/* ✅ ratio tipo Passline */}
                  <div className="relative aspect-[800/400] md:aspect-[1400/450]">
                    <picture className="absolute inset-0">
                      <source media="(max-width: 767px)" srcSet={mobileSrc} />
                      <img
                        src={desktopSrc}
                        alt={e.title}
                        className="h-full w-full object-cover"
                        loading={i === 0 ? "eager" : "lazy"}
                        draggable={false}
                      />
                    </picture>

                    {/* leve overlay para contraste */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
