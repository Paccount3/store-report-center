import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import { Shell } from "@/components/shell";
import "./globals.css";

const sans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Goodwill Store Dashboard",
  description: "Retail reporting, store performance, and AI report analysis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.className} antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
