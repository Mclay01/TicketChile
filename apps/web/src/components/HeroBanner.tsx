// components/HeroBanner.tsx
import Link from "next/link";

type Props = {
  href?: string;              // opcional: link a /eventos/...
  desktopSrc: string;         // /events/banner-1400x450.jpg
  mobileSrc: string;          // /events/banner-800x400.jpg
  alt: string;
};

export default function HeroBanner({
  href,
  desktopSrc,
  mobileSrc,
  alt,
}: Props) {
  const Wrapper: any = href ? Link : "div";
  const wrapperProps = href ? { href, "aria-label": alt } : {};

  return (
    <section className="relative w-screen left-1/2 right-1/2 -mx-[50vw]">
      {/* full-bleed real: se sale del max-w */}
      <Wrapper {...wrapperProps} className="block w-full">
        <picture>
          {/* Mobile primero */}
          <source media="(max-width: 768px)" srcSet={mobileSrc} />
          {/* Desktop por defecto */}
          <img
            src={desktopSrc}
            alt={alt}
            className="block w-full h-[220px] md:h-[320px] lg:h-[380px] object-cover select-none"
            draggable={false}
            loading="eager"
          />

        </picture>
      </Wrapper>
    </section>
  );
}
