import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "TicketChile",
  description: "Descubre eventos y encuentra tus entradas en TicketChile.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
