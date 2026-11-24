import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HoReCa Marketplace",
  description: "B2B marketplace for hotels, restaurants and cafés",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
