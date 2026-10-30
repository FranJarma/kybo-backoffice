import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { FormFeedback } from "@/components/ui/form-feedback";
const manrope = localFont({
  src: "../../public/fonts/manrope.ttf",
  variable: "--font-manrope",
  display: "swap",
  weight: "200 800",
});
export const metadata: Metadata = {
  title: "Kybo Operations",
  description: "Gestión interna de Kybo",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Kybo" },
  icons: {
    icon: "/favicon.ico",
    apple: "/pwa-icon/180",
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={manrope.variable}>
      <body>
        {children}
        <FormFeedback />
      </body>
    </html>
  );
}
