import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppProviders } from "@/frontend/components/app-providers";

export const metadata: Metadata = {
  title: {
    default: "Innkwise — Creative Operating System",
    template: "%s — Innkwise"
  },
  description: "A thoughtful workspace for turning ideas into meaningful work.",
  icons: [{ rel: "icon", url: "/brand/point-favicon.svg", type: "image/svg+xml" }]
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f1efe9"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
