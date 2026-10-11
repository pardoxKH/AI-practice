import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Applied AI Practice Tracker",
  description: "Projects, people, pipeline and hiring for the Applied AI practice",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
