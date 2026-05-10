import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global Gains",
  description: "Light up your state. The world is watching.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="bg-[#121212] text-white min-h-screen"
        style={{ fontFamily: "'Courier New', 'Courier', monospace" }}
      >
        {children}
      </body>
    </html>
  );
}
