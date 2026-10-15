import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AsOf — Every diagnosis, as it was known",
  description: "Diagnosis provenance and conflict-explanation tool for patients and second-opinion doctors with bitemporal EHR querying and clinical provenance tracing.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-[#0b0f14] text-slate-100 antialiased selection:bg-teal-500/30 selection:text-teal-200`}>
        {children}
      </body>
    </html>
  );
}
