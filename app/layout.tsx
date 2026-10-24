import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fuentes servidas desde el propio proyecto (app/fonts): no dependen de Google y no bloquean el primer pintado.
// Solo se incluyen los pesos que usa la interfaz.
const dmSans = localFont({
  src: [
    { path: "./fonts/dm-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/dm-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/dm-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--fuente-sans",
});

const merriweather = localFont({
  src: "./fonts/merriweather-latin-700-normal.woff2",
  weight: "700",
  variable: "--fuente-serif",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: "THEMIS",
  description: "Consultorio Jurídico",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${dmSans.variable} ${merriweather.variable}`}>
      <body>{children}</body>
    </html>
  );
}
