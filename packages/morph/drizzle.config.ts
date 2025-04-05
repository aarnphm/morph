import "dotenv/config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./db/schema.ts",
  out: "migrations",
  dialect: "postgresql",
  driver: "pglite",
  verbose: true,
  strict: true,
})
