import { relations } from "drizzle-orm"
import * as p from "drizzle-orm/pg-core"
import { createId } from "@paralleldrive/cuid2"

export const vaults = p.pgTable("vaults", {
  id: p.text("id").primaryKey().$defaultFn(() => createId()),
  name: p.text("name").notNull(),
  lastOpened: p.timestamp("lastOpened", { mode: "date" }).notNull().defaultNow(),
  tree: p.jsonb("tree").notNull(),
  settings: p.jsonb("settings").notNull(),
})

export const vaultsRelations = relations(vaults, ({ one, many }) => ({
  references: one(references),
  notes: many(notes),
}))

export const files = p.pgTable("files", {
  id: p.text("id").primaryKey().$defaultFn(() => createId()),
  name: p.text("name").notNull(),
  extension: p.text("extension").notNull(),
  vaultId: p.text("vaultId").notNull().references(() => vaults.id, {onDelete: "cascade"}),
  lastModified: p.timestamp("lastModified", { mode: "date" }).notNull().defaultNow(),
  embeddingStatus
})

export const references = p.pgTable("references", {
  id: p.text("id").primaryKey().$defaultFn(() => createId()),
  vaultId: p.text("vaultId").notNull().references(() => vaults.id, {onDelete: "cascade"}),
  handle: p.jsonb("handle").notNull(),
  format: p.text("format", {
    enum: ["biblatex", "csl-json"],
  }).notNull(),
  path: p.text("path").notNull(),
  lastModified: p.timestamp("lastModified", { mode: "date" }).notNull().defaultNow(),
})

export const referencesRelations = relations(references, ({ one }) => ({
  vault: one(vaults, {
    fields: [references.vaultId],
    references: [vaults.id],
  }),
}))

export const notes = p.pgTable("notes", {
  id: p.text("id").primaryKey().$defaultFn(() => createId()),
  content: p.text("content").notNull(),
  color: p.text("color").notNull(),
  createdAt: p.timestamp("createdAt", { mode: "date" }).notNull(),
  accessedAt: p.timestamp("accessedAt", { mode: "date" }).notNull(),
  dropped: p.boolean("dropped").notNull().default(false),
  fileId: p.text("fileId").notNull(),
  steering: p.jsonb("steering").notNull(), // check lib/db.tsx#Note.steering
  embedding: p.jsonb("embedding").notNull(), // check lib/db.tsx#Note.embedding
}, (table) => ([
  p.index("idx_notes_vault_filename").on(table.vaultId, table.fileName),
  p.index("idx_notes_reasoning").on(table.reasoningId),
]))

export const notesRelations = relations(notes, ({ one }) => ({
}))
