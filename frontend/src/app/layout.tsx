import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";
import { NotificationProvider } from "@/components/providers/notification-provider";
import { StoreHydration } from "@/components/providers/store-hydration";
import { ThemeProvider } from "@/components/providers/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PGVector Workbench",
  description: "A modern PostgreSQL vector database visualization tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full bg-neutral-50 dark:bg-neutral-950`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <StoreHydration>
            <QueryProvider>
              <NotificationProvider>
                {children}
              </NotificationProvider>
            </QueryProvider>
          </StoreHydration>
        </ThemeProvider>
      </body>
    </html>
  );
}
