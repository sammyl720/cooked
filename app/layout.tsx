import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cooked? — Read the room",
  description: "A playful read of the visible signals in a dating chat.",
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
