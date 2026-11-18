import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VELTO | Maamul ganacsiga, si ka fudud",
  description:
    "VELTO waa madal isku xiran oo ganacsiyada ka caawisa maamul habaysan, iibka, kaydka iyo hawlaha maalinlaha ah.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="so" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
