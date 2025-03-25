import { withPlausibleProxy } from "next-plausible"

export default withPlausibleProxy({
  customDomain: "https://morph-editor.app",
})({
  assetPrefix: process.env.NODE_ENV === "production" ? undefined : "",
  transpilePackages: ["next-plausible", "katex", "mermaid"],
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
