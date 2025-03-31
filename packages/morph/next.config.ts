import MillionLint from "@million/lint"
import { withPlausibleProxy } from "next-plausible"

export default MillionLint.next({
  enabled: ["1", "true", "y", "yes"].includes(process.env.DEBUG?.toLowerCase() ?? ""),
  rsc: true,
  skipTransform: process.env.NODE_ENV === "production",
  react: "19",
  filter: { exclude: "**/components/ui/*.{mtsx,mjsx,tsx,jsx}" },
})(
  withPlausibleProxy({
    customDomain: "https://morph-editor.app",
  })({
    assetPrefix: process.env.NODE_ENV === "production" ? undefined : "",
    transpilePackages: [
      "next-plausible",
      "katex",
      "mermaid",
      "flexsearch",
      "@electric-sql/pglite-react",
      "@electric-sql/pglite",
    ],
    devIndicators: false,
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
  }),
)
