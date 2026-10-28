import type { Metadata } from "next";
import { Cinzel, Geist, Geist_Mono, Lora } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const displayFont = Cinzel({ variable: "--font-display", subsets: ["latin"] });
const bodySerif = Lora({ variable: "--font-body-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Vanishing of Dr. Hale",
  description:
    "A server-authoritative 2D mystery game — Blackwood Observatory case",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} ${bodySerif.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
