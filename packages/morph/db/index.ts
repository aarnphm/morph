import { IdbFs, PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { vector } from "@electric-sql/pglite/vector"
import type { MigrationMeta } from "drizzle-orm/migrator"

import { MorphPgLite } from "@/context/db"

export * from "@/db/schema"
export * from "@/db/interfaces"

export const PGLITE_DB_NAME = "morph-pglite"

// Singleton instance and promise
let db: MorphPgLite | null = null // Use PGlite type directly
let initPromise: Promise<MorphPgLite> | null = null

// Function to get the initialized PGlite instance (singleton pattern)
// This function ONLY ensures the PGlite client is created and extensions are loaded.
// It does NOT handle schema creation/migration.
export async function initializeDb(): Promise<MorphPgLite> {
  if (db) {
    return db
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const pg = await PGlite.create({
          fs: new IdbFs(PGLITE_DB_NAME),
          relaxedDurability: true,
          extensions: { live, vector },
        })
        // Ensure vector extension exists - this is lightweight
        await pg.exec(`CREATE EXTENSION IF NOT EXISTS vector;`)
        db = pg
        return pg
      } catch (error) {
        console.error("getDbInstance: Failed to initialize PGlite client:", error)
        db = null // Reset instance on failure
        initPromise = null // Reset promise on failure
        throw error
      }
    })()
  }
  return initPromise
}

// --- Browser Migration Runner --- //
const MIGRATIONS_TABLE = "__drizzle_migrations"

async function ensureMigrationsTable(db: MorphPgLite) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      hash TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL
    )
  `)
}

async function getAppliedMigrationHashes(db: MorphPgLite): Promise<string[]> {
  try {
    const result = await db.query<{ hash: string }>(`
      SELECT hash FROM ${MIGRATIONS_TABLE} ORDER BY created_at ASC
    `)
    return result.rows.map((row) => row.hash)
  } catch (error) {
    // Handle case where table might not exist yet (though ensureMigrationsTable should prevent this)
    console.error("Error fetching migration hashes:", error)
    // Attempt to create table again just in case, then return empty
    await ensureMigrationsTable(db)
    return []
  }
}

async function recordMigration(db: MorphPgLite, hash: string) {
  await db.query(
    `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [hash, Date.now()],
  )
}

/**
 * Applies migrations to the PGlite database in the browser.
 * Requires compiled migrations from a build step.
 *
 * @param db The initialized PGlite instance.
 * @param migrations The compiled migration data (array of MigrationMeta).
 */
export async function applyPgLiteMigrations(db: MorphPgLite, migrations: MigrationMeta[]) {
  if (!migrations || migrations.length === 0) {
    return
  }

  try {
    // 1. Ensure the migrations tracking table exists
    await ensureMigrationsTable(db)

    // 2. Get hashes of already applied migrations
    const appliedHashes = await getAppliedMigrationHashes(db)
    const appliedHashesSet = new Set(appliedHashes)

    // 3. Filter out already applied migrations
    const pendingMigrations = migrations.filter(
      (migration) => !appliedHashesSet.has(migration.hash),
    )

    if (pendingMigrations.length === 0) {
      return
    }

    // 4. Apply pending migrations sequentially
    for (const migration of pendingMigrations) {
      // Drizzle's compiled migrations split SQL by '-->' comments.
      // PGlite's exec can handle multiple statements separated by ';'.
      // We join the SQL parts with ';'. Check if PGlite needs this or handles the array directly.
      // Assuming pg.exec handles multi-statement strings separated by ';'.
      const sqlBatch = migration.sql.join("\n;\n") // Join statements safely
      try {
        // Execute the batch of SQL statements for the migration
        await db.exec(sqlBatch)

        // Record the migration hash in the tracking table
        await recordMigration(db, migration.hash)
      } catch (error) {
        console.error(`applyPgLiteMigrations: Failed to apply migration ${migration.hash}:`, error)
        console.error("Failed SQL batch:", sqlBatch) // Log the failing SQL
        throw new Error(`Failed during migration ${migration.hash}`) // Re-throw to stop the process
      }
    }
  } catch (error) {
    console.error("applyPgLiteMigrations: Migration process failed:", error)
    throw error
  }
}
