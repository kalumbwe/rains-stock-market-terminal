import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LuSE Pulse — Zambia Market Terminal",
  description:
    "Real-time simulated LuSE trading terminal: live Zambian equities quotes, LASI index, charts, technicals, screener, paper trading, alerts and market news.",
  keywords: ["LuSE", "Zambia", "stock market", "LASI", "trading terminal", "market analysis"],
  authors: [{ name: "Z.ai Team" }],
  manifest: "/manifest.webmanifest",
  applicationName: "LuSE Pulse",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LuSE Pulse",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  openGraph: {
    title: "LuSE Pulse — Zambia Market Terminal",
    description:
      "Real-time Zambia LuSE market analysis: live quotes, LASI index, charts, screener and paper trading.",
    siteName: "LuSE Pulse",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
