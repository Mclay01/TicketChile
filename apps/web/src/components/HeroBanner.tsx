// components/HeroBanner.tsx
import Link from "next/link";

type Props = {
  href?: string;
  desktopSrc: string;
  mobileSrc: string;
  alt: string;

  fullBleed?: boolean; // edge-to-edge real
  priority?: boolean; // carga rápida
  height?: {
    base?: number; // px
    md?: number;
    lg?: number;
  };
};

export default function HeroBanner({
  href,
  desktopSrc,
  mobileSrc,
  alt,
  fullBleed = true,
  priority = true,
  height = { base: 220, md: 320, lg: 380 },
}: Props) {
  const Wrapper: any = href ? Link : "div";
  const wrapperProps = href ? { href, "aria-label": alt } : {};

  // ✅ Full-bleed estable (evita el “scroll horizontal fantasma”)
  const sectionClass = fullBleed
    ? "relative left-1/2 -translate-x-1/2 w-[100vw] overflow-hidden"
    : "relative w-full overflow-hidden";

  const hBase = height.base ?? 220;
  const hMd = height.md ?? 320;
  const hLg = height.lg ?? 380;

  return (
    <section
      className={sectionClass}
      style={
        {
          // CSS vars para alturas responsivas (sin styled-jsx)
          ["--hb-h-base" as any]: `${hBase}px`,
          ["--hb-h-md" as any]: `${hMd}px`,
          ["--hb-h-lg" as any]: `${hLg}px`,
        } as React.CSSProperties
      }
    >
      <Wrapper {...wrapperProps} className="block w-full">
        <picture>
          {/* ✅ Mobile <= 767px (Tailwind md arranca en 768) */}
          <source media="(max-width: 767px)" srcSet={mobileSrc} />

          <img
            src={desktopSrc}
            alt={alt}
            className={[
              "block w-full select-none object-cover",
              "h-[var(--hb-h-base)] md:h-[var(--hb-h-md)] lg:h-[var(--hb-h-lg)]",
            ].join(" ")}
            draggable={false}
            loading={priority ? "eager" : "lazy"}
            // Si TS se pone exquisito con fetchPriority, lo dejamos tipado seguro
            fetchPriority={priority ? ("high" as const) : ("auto" as const)}
            decoding="async"
          />
        </picture>
      </Wrapper>
    </section>
  );
}
