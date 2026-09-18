import SiteHeader from "@/components/public/SiteHeader";
import Footer from "@/components/tc/Footer";
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="tc"><a href="#contenido" className="skip">Saltar al contenido</a><SiteHeader /><main id="contenido" className="container" style={{ minHeight: "65vh" }}>{children}</main><Footer /></div>;
}
