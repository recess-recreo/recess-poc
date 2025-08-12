import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recess POC Demo",
  description: "AI-powered activity recommendations demo",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}