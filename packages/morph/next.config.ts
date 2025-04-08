import { withPlausibleProxy } from "next-plausible"

const plausible = withPlausibleProxy({ customDomain: "https://morph-editor.app" })

export default plausible({
  assetPrefix: process.env.NODE_ENV === "production" ? undefined : "",
  transpilePackages: [
    "next-plausible",
    "katex",
    "flexsearch",
    "@electric-sql/pglite-react",
    "@electric-sql/pglite",
  ],
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.(woff|woff2|eot|ttf|otf)$/,
      type: "asset/resource",
      generator: {
        filename: "static/fonts/[name][ext]",
      },
    })
    return config
  },
})
