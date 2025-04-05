import { readMigrationFiles } from "drizzle-orm/migrator"
import fs from "node:fs/promises"
import path from "node:path"

// --- Configuration ---
const migrationsFolder = path.join(__dirname, "./migrations") // Adjust path to your migrations
const outputFile = path.join(__dirname, "./generated/migrations.json") // Output file accessible by your app src
// ---------------------

async function compile() {
  console.log(`Reading migrations from: ${migrationsFolder}`)
  const migrations = readMigrationFiles({ migrationsFolder })

  console.log(`Found ${migrations.length} migrations.`)

  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputFile), { recursive: true })

  // Write migrations to JSON
  await fs.writeFile(outputFile, JSON.stringify(migrations, null, 2)) // Pretty print JSON

  console.log(`Migrations successfully compiled to: ${outputFile}`)
}

compile().catch((err) => {
  console.error("Failed to compile migrations:", err)
  process.exit(1)
})
