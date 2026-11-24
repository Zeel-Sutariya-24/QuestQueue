import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Pixel Queue — one hero, everybody watching",
  description:
    "A queue-based multiplayer 2D platformer. One player controls the hero at a time, everyone else watches, votes and builds levels.",
};

export const viewport: Viewport = { themeColor: "#070815", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>
          <Navbar />
          <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6">{children}</main>
          <footer className="border-t border-line/60 py-6 text-center text-sm text-slate-500">
            <span className="font-pixel text-[9px]">PIXEL QUEUE</span> — one hero at a time. Built with Next.js, Phaser 3 &amp;
            Socket.IO.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
