import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import HeroUIProvider from "@/providers/heroui";
import AuthProvider from "@/providers/auth";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          src="https://kit.fontawesome.com/da71fc72b9.js"
          crossOrigin="anonymous"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "!function(){try{var t=localStorage.getItem('ui_theme')||'system';var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var d=document.documentElement;var u=t==='dark'||t==='system'&&m;u?d.classList.add('dark'):d.classList.remove('dark')}catch(e){}}();",
          }}
        />
      </head>
      <body
        className={`${notoSansThai.variable} ${notoSansThai.className} antialiased select-none`}
      >
        <HeroUIProvider>
          <AuthProvider>{children}</AuthProvider>
        </HeroUIProvider>
      </body>
    </html>
  );
}
