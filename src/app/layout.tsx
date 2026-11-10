import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * Apply a stored theme before first paint. Keep this tiny and dependency-free;
 * the matching control is `ThemeToggle`. The CSP allows inline scripts.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("cm_theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: "ChromaMatch — colour memory arcade",
    template: "%s · ChromaMatch",
  },
  description: "A colour-matching arcade game with global, daily, and room modes.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1ead9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a10" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${plusJakartaSans.variable} ${jetBrainsMono.variable}`}
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-xl focus:border-2 focus:border-ring focus:bg-card focus:px-4 focus:py-2.5 focus:font-display focus:font-semibold focus:text-foreground focus:shadow-lg focus:outline-none"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
