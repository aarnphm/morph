import { PGlite, PGliteInterfaceExtensions } from "@electric-sql/pglite"
import { live } from "@electric-sql/pglite/live"
import { vector } from "@electric-sql/pglite/vector"
import { makePGliteProvider } from "@electric-sql/pglite-react"

const { PGliteProvider, usePGlite } = makePGliteProvider<
  PGlite &
    PGliteInterfaceExtensions<{
      live: typeof live
      vector: typeof vector
    }>
>()

export { PGliteProvider, usePGlite }
