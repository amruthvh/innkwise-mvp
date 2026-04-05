import type { ReactNode } from "react";
import "./globals.css";
import { AppProviders } from "@/app/components/app-providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
