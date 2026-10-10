import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FixFlow Demo",
  description: "LDR and DHT11 sensor and maintenance workflow demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
