import { type Metadata, type Viewport } from "next"
import PlausibleProvider from "next-plausible"
import Script from "next/script"
import type React from "react"

import { Toaster } from "@/components/ui/toaster"

import { Providers } from "@/context/providers"

import "./globals.css"

export const metadata: Metadata = {
  title: "morph-editor.app",
  description: "WYSIWYG text editor with LLM-driven suggestions",
  abstract: "WYSIWYG text editor with LLM-driven suggestions",
  applicationName: "morph",
  authors: [{ name: "Aaron Pham", url: "https://aarnphm.xyz" }],
  keywords: ["sae", "bentoml", "wysiwyg", "nextjs", "remark", "rehype", "mech interp"],
  creator: "Aaron Pham",
  publisher: "Hinterland",
  alternates: {
    canonical: "https://morph-editor.app",
  },
  icons: [{ rel: "icon", url: "https://morph-editor.app/icon.png" }],
  // TODO: OG and Twitter card
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script
          defer
          src="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/contrib/copy-tex.min.js"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css"
          integrity="sha384-zh0CIslj+VczCZtlzBcjt5ppRcsAmDnRem7ESsYwWwg3m/OaJ2l4x7YBZl9Kxxib"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <PlausibleProvider domain="morph-editor.app" trackOutboundLinks trackFileDownloads>
          <Providers>{children}</Providers>
        </PlausibleProvider>
        <Toaster />
        {process.env.NODE_ENV === "production" && (
          <Script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon='{"token": "79bda9a021e14500b90f2e12a664d4f1", "spa": true}'
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  )
}
