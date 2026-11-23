import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { TimezoneSync } from "@/components/timezone-sync";
import { PALETTE } from "@/lib/palette";
import "./globals.css";

// The one font for the whole app (plans/habit-tracker.md, Design direction).
// Variable, with optical sizes, so small text stays calm and titles get
// their character.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  // A page's own title gets the app name after it ("Log in · Hold").
  title: { default: "Hold", template: "%s · Hold" },
  description: "Habits you press and hold. A streak and a week of dots for each.",
};

export const viewport: Viewport = {
  // Lets the page reach the screen edges and switches on the iPhone safe
  // areas (env(safe-area-inset-*)), which the layout pads for.
  viewportFit: "cover",
  // The browser and status bar colour, matching the page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PALETTE.light.background },
    { media: "(prefers-color-scheme: dark)", color: PALETTE.dark.background },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TimezoneSync />
        {children}
      </body>
    </html>
  );
}
