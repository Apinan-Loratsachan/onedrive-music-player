import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import HeroUIProvider from "@/providers/heroui";
import MsalProviderWrapper from "@/providers/msal";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  display: "swap",
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: "OneDrive Music Player",
  description: "OneDrive Music Player",
  authors: [
    {
      name: "Apinan Loratsachan",
      url: "https://github.com/Apinan-Loratsachan",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          src="https://kit.fontawesome.com/da71fc72b9.js"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={`${notoSansThai.variable} ${notoSansThai.className} antialiased select-none`}
      >
        <HeroUIProvider>
          <MsalProviderWrapper>{children}</MsalProviderWrapper>
        </HeroUIProvider>
      </body>
    </html>
  );
}
