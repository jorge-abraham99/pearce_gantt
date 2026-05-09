import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pearce Planner Demo",
  description: "Lightweight baler scheduling and worker Gantt demo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
