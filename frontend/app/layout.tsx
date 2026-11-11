import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "./lib/theme";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin",]
});

export const metadata: Metadata = {
  title: "Employee Welfare Portal",
  description: "Employee emergency financial assistance workflow.",
};

export default function RootLayout({ children }: LayoutProps<"/">){
  return(
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} h-full antialiased`}
      // Phase 7 (G2): the head script may set data-theme before React hydrates — expected, not a bug.
      suppressHydrationWarning
      >
        <head>
          {/* Apply a saved light/dark choice before first paint (no flash of the wrong theme). */}
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        </head>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
  );
}