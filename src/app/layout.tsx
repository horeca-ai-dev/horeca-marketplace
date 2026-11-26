import type { Metadata } from "next";
import { fontLatin, fontLatinExt } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "HoReCa Marketplace",
  description: "B2B marketplace for hotels, restaurants and cafés",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fontLatin.variable} ${fontLatinExt.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
