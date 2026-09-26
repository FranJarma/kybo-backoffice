import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
const manrope = localFont({
  src: "../../public/fonts/manrope.ttf",
  variable: "--font-manrope",
  display: "swap",
  weight: "200 800",
});
export const metadata: Metadata = {
  title: "Kybo Operations",
  description: "Gestión interna de Kybo",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
