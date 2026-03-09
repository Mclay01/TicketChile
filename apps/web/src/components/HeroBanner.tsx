import Link from "next/link";

type Props = {
  href?: string;
  desktopSrc: string;
  mobileSrc: string;
  alt: string;
  fullBleed?: boolean;
  priority?: boolean;
  height?: {
    base?: number;
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
  height = { base: 230, md: 360, lg: 420 },
}: Props) {
  const Wrapper: any = href ? Link : "div";
  const wrapperProps = href ? { href, "aria-label": alt } : {};

  const sectionClass = fullBleed
    ? "relative left-1/2 -translate-x-1/2 w-[100vw] overflow-hidden"
    : "relative w-full overflow-hidden";

  const hBase = height.base ?? 230;
  const hMd = height.md ?? 360;
  const hLg = height.lg ?? 420;

  return (
    <section
      className={sectionClass}
      style={
        {
          ["--hb-h-base" as any]: `${hBase}px`,
          ["--hb-h-md" as any]: `${hMd}px`,
          ["--hb-h-lg" as any]: `${hLg}px`,
        } as React.CSSProperties
      }
    >
      <Wrapper {...wrapperProps} className="block w-full">
        <div className="relative w-full overflow-hidden h-[var(--hb-h-base)] md:h-[var(--hb-h-md)] lg:h-[var(--hb-h-lg)]">
          <picture>
            <source media="(max-width: 767px)" srcSet={mobileSrc} />

            <img
              src={desktopSrc}
              alt={alt}
              draggable={false}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? ("high" as const) : ("auto" as const)}
              decoding="async"
              className={[
                "absolute left-1/2 top-0 block h-full -translate-x-1/2 select-none object-cover object-center",
                // móvil: llena normal
                "w-full min-w-0",
                // desktop/tablet: evita que se adelgace, mejor recorta lados
                "md:w-auto md:max-w-none md:min-w-[1280px]",
                "lg:min-w-[1440px]",
                "xl:min-w-[1600px]",
              ].join(" ")}
            />
          </picture>
        </div>
      </Wrapper>
    </section>
  );
}