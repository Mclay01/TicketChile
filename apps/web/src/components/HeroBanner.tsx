import Link from "next/link";

type Props = {
  href?: string;
  desktopSrc: string;
  mobileSrc: string;
  alt: string;
  fullBleed?: boolean;
  priority?: boolean;
  height?: {
    mobile?: number;
    desktop?: number;
  };
};

export default function HeroBanner({
  href,
  desktopSrc,
  mobileSrc,
  alt,
  fullBleed = true,
  priority = true,
  height = { mobile: 230, desktop: 420 },
}: Props) {
  const Wrapper: any = href ? Link : "div";
  const wrapperProps = href ? { href, "aria-label": alt } : {};

  const sectionClass = fullBleed
    ? "relative left-1/2 -translate-x-1/2 w-screen overflow-hidden"
    : "relative w-full overflow-hidden";

  const mobileH = height.mobile ?? 230;
  const desktopH = height.desktop ?? 420;

  return (
    <section
      className={sectionClass}
      style={
        {
          ["--hb-mobile-h" as any]: `${mobileH}px`,
          ["--hb-desktop-h" as any]: `${desktopH}px`,
        } as React.CSSProperties
      }
    >
      <Wrapper {...wrapperProps} className="block w-full">
        <div className="relative w-full h-[var(--hb-mobile-h)] md:h-[var(--hb-desktop-h)]">
          <picture>
            <source media="(max-width: 767px)" srcSet={mobileSrc} />
            <img
              src={desktopSrc}
              alt={alt}
              draggable={false}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? ("high" as const) : ("auto" as const)}
              decoding="async"
              className="block h-full w-full select-none object-cover object-center"
            />
          </picture>
        </div>
      </Wrapper>
    </section>
  );
}