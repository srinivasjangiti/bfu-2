import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/ToastProvider";
import { ClerkProvider } from "@clerk/nextjs";
import {
  JsonLd,
  websiteSchema,
  organizationSchema,
  softwareApplicationSchema,
} from "@/components/JsonLd";

const BASE_URL = "https://beforeyousign.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "BeforeYouSign — Free AI Contract Analysis & Risk Detection",
    template: "%s | BeforeYouSign",
  },
  description:
    "Upload any contract and get instant AI-powered risk analysis. Identify hidden clauses, unlimited liability traps, auto-renewal tricks, and dangerous obligations — free, in under 30 seconds.",
  keywords: [
    "AI contract analysis",
    "free contract review",
    "contract risk detection",
    "legal AI",
    "hidden clause detection",
    "contract analyzer",
    "legal tech",
    "AI legal assistant",
    "contract risk assessment",
    "contract management software",
    "review contract online",
    "NDA analysis",
    "employment contract review",
    "lease agreement analysis",
    "legal document analysis",
  ],
  authors: [{ name: "BeforeYouSign", url: BASE_URL }],
  creator: "BeforeYouSign",
  publisher: "BeforeYouSign",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
  openGraph: {
    title: "BeforeYouSign — Free AI Contract Analysis",
    description:
      "Upload any contract and get instant AI-powered risk analysis. Identify hidden clauses, dangerous obligations & negotiation opportunities — free, in 30 seconds.",
    type: "website",
    url: BASE_URL,
    locale: "en_US",
    siteName: "BeforeYouSign",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "BeforeYouSign — AI Contract Intelligence Platform",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BeforeYouSign — Free AI Contract Analysis",
    description:
      "Upload any contract. Get instant AI risk analysis, hidden clause detection, and negotiation tips — free in under 30 seconds.",
    images: ["/opengraph-image"],
    site: "@beforeyousign",
    creator: "@beforeyousign",
  },
  category: "Legal Technology",
  classification: "Business/Legal",
};

export const viewport: import("next").Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1c1917",
};

const CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  "pk_test_cG9saXRlLXJpbmd0YWlsLTQzNDAuY2xlcmsuYWNjb3VudHMuZGV2JA";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://integrate.api.nvidia.com" />

        {/* DNS Prefetch */}
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://integrate.api.nvidia.com" />

        {/* Clerk preconnect */}
        <link rel="preconnect" href="https://clerk.clerk.services" />

        {/* Canonical & alternate */}
        <link rel="canonical" href={BASE_URL} />

        {/* Structured data */}
        <JsonLd data={websiteSchema()} />
        <JsonLd data={organizationSchema()} />
        <JsonLd data={softwareApplicationSchema()} />
      </head>
      <body className="antialiased">
        <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
          <ToastProvider>
            <ErrorBoundary>
              <Navbar />
              {children}
              <Footer />
            </ErrorBoundary>
          </ToastProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
