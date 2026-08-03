import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist_Mono } from "next/font/google";
import "hack-font/build/web/hack.css";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { BackToTop } from "@/components/back-to-top";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Quantum Security Group",
    template: "%s | QSG",
  },
  description:
    "The official community of the Quantum Security Group. Members post, followers react and discuss.",
  icons: {
    icon: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorPrimary: "#00d0ff",
          colorBackground: "#0b0d0b",
          colorForeground: "#d6e3d6",
          colorInput: "#0f120f",
          colorInputForeground: "#d6e3d6",
          colorNeutral: "#6e7f6e",
        },
        elements: {
          card: "border border-edge shadow-none",
          footer: "text-muted",
        },
      }}
    >
      <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col">
          <Navbar />
          <main className="mx-auto w-full max-w-8xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
          <Footer />
          <BackToTop />
        </body>
      </html>
    </ClerkProvider>
  );
}
