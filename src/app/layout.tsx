import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Idea Inbox",
  description: "Capture ideas fast, enrich them nightly.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
