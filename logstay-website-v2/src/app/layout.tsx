import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "LogStay — The Offline-Native Operating System for Modern Hospitality",
  description:
    "LogStay runs your hostel, guesthouse, or boutique hotel entirely from a phone — even when the internet is down. Check in guests with a 3-second passport scan, track every room in real time, and never lose revenue to a dropped connection again.",
  keywords: [
    "LogStay",
    "hospitality software",
    "hostel management",
    "offline PMS",
    "boutique hotel",
    "guesthouse",
    "passport scanner",
    "check-in",
    "cash drawer",
    "Form C",
  ],
  authors: [{ name: "LogStay Technologies" }],
  icons: {
    icon: [
      { url: "/LogStay/logo.svg", type: "image/svg+xml" },
      { url: "/LogStay/favicon.png", type: "image/png" },
    ],
    shortcut: "/LogStay/favicon.png",
    apple: "/LogStay/icon.png",
  },
  openGraph: {
    title: "LogStay — Your front desk, always open.",
    description:
      "The offline-native operating system for modern hospitality. Works without internet. Scans passports in 3 seconds. Catches cash going missing.",
    url: "https://breathtaker-adi.github.io/LogStay/",
    siteName: "LogStay",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LogStay",
    description: "Your front desk, always open — even when the internet is down.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
