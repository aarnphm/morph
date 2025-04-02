import { PGlite, PGliteInterfaceExtensions } from "@electric-sql/pglite"
import { makePGliteProvider } from "@electric-sql/pglite-react"
import { live } from "@electric-sql/pglite/live"
import { vector } from "@electric-sql/pglite/vector"

export type MorphPgLite = PGlite &
  PGliteInterfaceExtensions<{
    live: typeof live
    vector: typeof vector
  }>

const { PGliteProvider, usePGlite } = makePGliteProvider<MorphPgLite>()

export { PGliteProvider, usePGlite }
