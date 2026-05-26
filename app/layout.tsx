import type { Metadata } from "next";

import AppNav from "@/components/AppNav";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pearce Planner",
  description: "Machine production scheduling and worker Gantt.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppNav />
        <main className="mx-auto w-full max-w-[120rem] px-4 py-3 md:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
