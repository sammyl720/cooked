import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Chat Receipt — Read the signals",
  description: "Drop a dating chat and get a playful receipt for the visible signals.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className="antialiased">{children}</body>
    </html>
  );
}
