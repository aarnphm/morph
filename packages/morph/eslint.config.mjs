import { FlatCompat } from "@eslint/eslintrc"
import tsParser from "@typescript-eslint/parser"
import drizzle from "eslint-plugin-drizzle"
import { defineConfig } from "eslint/config"
import { dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

export default defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  ...compat.config({
    extends: ["next"],
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-page-custom-font": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  }),
  {
    plugins: {
      drizzle,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 5,
      sourceType: "script",

      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "drizzle/enforce-delete-with-where": [
        "error",
        {
          drizzleObjectName: ["db"],
        },
      ],
    },
  },
])
