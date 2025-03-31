import "dotenv/config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./db/schema.ts",
  dialect: "postgresql",
  driver: "pglite",
  verbose: true,
  strict: true,
})
