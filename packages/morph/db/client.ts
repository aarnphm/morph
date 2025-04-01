import { IdbFs, PGlite } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { vector } from "@electric-sql/pglite/vector"

export const PGLITE_DB_NAME = "morph-pglite"

export const client = await PGlite.create({
  fs: new IdbFs(PGLITE_DB_NAME),
  relaxedDurability: true,
  extensions: { live, vector },
})
