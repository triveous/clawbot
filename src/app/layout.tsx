import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "SnapClaw — One-Click Personal AI Agents",
  description:
    "Deploy your personal AI agent in under 5 minutes. No Docker, no terminal, no API keys. Managed OpenClaw hosting for everyone.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={{ variables: { fontFamily: "var(--font-geist-sans)" } }}>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
        /* The pre-paint <ThemeInit> script inside the dashboard layout flips
           the `dark` class on <html> from localStorage before React hydrates,
           so the server and client class strings diverge for one render.
           Suppressing the warning is the standard fix (next-themes does the
           same) — React still hydrates; we're only silencing the noise. */
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          {children}
          <Toaster
            richColors
            position="bottom-right"
            closeButton
            toastOptions={{
              classNames: {
                toast:
                  "group border border-border bg-background text-foreground",
              },
            }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
