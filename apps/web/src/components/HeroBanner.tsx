import Link from "next/link";

type Props = {
  href?: string;
  desktopSrc: string;
  mobileSrc: string;
  alt: string;

  fullBleed?: boolean;
  priority?: boolean;

  height?: {
    min?: number;   // altura mínima
    fluid?: number; // factor viewport
    max?: number;   // altura máxima
  };
};

export default function HeroBanner({
  href,
  desktopSrc,
  mobileSrc,
  alt,
  fullBleed = true,
  priority = true,
  height = {
    min: 260,
    fluid: 34,
    max: 420,
  },
}: Props) {
  const Wrapper: any = href ? Link : "div";
  const wrapperProps = href ? { href, "aria-label": alt } : {};

  const sectionClass = fullBleed
    ? "relative left-1/2 -translate-x-1/2 w-[100vw] overflow-hidden"
    : "relative w-full overflow-hidden";

  const minH = height.min ?? 260;
  const fluid = height.fluid ?? 34;
  const maxH = height.max ?? 420;

  return (
    <section
      className={sectionClass}
      style={
        {
          ["--hb-min" as any]: `${minH}px`,
          ["--hb-fluid" as any]: `${fluid}vw`,
          ["--hb-max" as any]: `${maxH}px`,
        } as React.CSSProperties
      }
    >
      <Wrapper {...wrapperProps} className="block w-full">
        <picture>
          <source media="(max-width: 767px)" srcSet={mobileSrc} />

          <img
            src={desktopSrc}
            alt={alt}
            className="block w-full select-none object-cover h-[clamp(var(--hb-min),var(--hb-fluid),var(--hb-max))]"
            draggable={false}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? ("high" as const) : ("auto" as const)}
            decoding="async"
          />
        </picture>
      </Wrapper>
    </section>
  );
}