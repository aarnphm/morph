import { relations } from "drizzle-orm"
import * as p from "drizzle-orm/pg-core"
import { createId } from "@paralleldrive/cuid2"
import { Steering, Settings, FileSystemTreeNode } from "@/lib/db"

export const vaults = p.pgTable("vaults", {
  id: p
    .text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: p.text("name").notNull(),
  lastOpened: p.timestamp("lastOpened", { mode: "date" }).notNull().defaultNow(),
  tree: p.jsonb("tree").$type<FileSystemTreeNode>().notNull(),
  settings: p.jsonb("settings").$type<Settings>().notNull(),
})

export const vaultsRelations = relations(vaults, ({ one, many }) => ({
  references: one(references),
  files: many(files),
}))

export const files = p.pgTable(
  "files",
  {
    id: p
      .text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    name: p.text("name").notNull(),
    extension: p.text("extension").notNull(),
    vaultId: p
      .text("vaultId")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    lastModified: p.timestamp("lastModified", { mode: "date" }).notNull().defaultNow(),
    embeddingStatus: p
      .text("embeddingStatus", {
        enum: ["in_progress", "success", "failure", "cancelled"],
      })
      .notNull()
      .default("in_progress"),
    embeddingTaskId: p.text("embeddingTaskId").references(() => tasks.id),
  },
  (table) => [p.index("idx_files_vault_filename").on(table.vaultId, table.name)],
)

export const filesRelations = relations(files, ({ one, many }) => ({
  vault: one(vaults, {
    fields: [files.vaultId],
    references: [vaults.id],
  }),
  notes: many(notes),
  reasonings: many(reasonings),
}))

export const references = p.pgTable("references", {
  id: p
    .text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  fileId: p
    .text("fileId")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  vaultId: p
    .text("vaultId")
    .notNull()
    .references(() => vaults.id, { onDelete: "cascade" }),
  handle: p.jsonb("handle").notNull(),
  format: p
    .text("format", {
      enum: ["biblatex", "csl-json"],
    })
    .notNull(),
  lastModified: p.timestamp("lastModified", { mode: "date" }).notNull().defaultNow(),
})

export const referencesRelations = relations(references, ({ one }) => ({
  vault: one(vaults, {
    fields: [references.vaultId],
    references: [vaults.id],
  }),
  file: one(files, {
    fields: [references.fileId],
    references: [files.id],
  }),
}))

export const notes = p.pgTable(
  "notes",
  {
    id: p
      .text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    content: p.text("content").notNull(),
    color: p.text("color").notNull(),
    createdAt: p.timestamp("createdAt", { mode: "date" }).notNull(),
    accessedAt: p.timestamp("accessedAt", { mode: "date" }).notNull(),
    dropped: p.boolean("dropped").notNull().default(false),
    fileId: p
      .text("fileId")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    vaultId: p
      .text("vaultId")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    reasoningId: p
      .text("reasoningId")
      .notNull()
      .references(() => reasonings.id, { onDelete: "cascade" }),
    steering: p.jsonb("steering").$type<Steering>().notNull(),
    embeddingStatus: p
      .text("embeddingStatus", {
        enum: ["in_progress", "success", "failure", "cancelled"],
      })
      .notNull()
      .default("in_progress"),
    embeddingTaskId: p.text("embeddingTaskId").references(() => tasks.id),
  },
  (table) => [
    p.index("idx_notes_vault_filename").on(table.vaultId, table.fileId),
    p.index("idx_notes_reasoning").on(table.reasoningId),
  ],
)

export const notesRelations = relations(notes, ({ one }) => ({
  file: one(files, {
    fields: [notes.fileId],
    references: [files.id],
  }),
  reasoning: one(reasonings, {
    fields: [notes.reasoningId],
    references: [reasonings.id],
  }),
}))

export const reasonings = p.pgTable(
  "reasonings",
  {
    id: p
      .text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    content: p.text("content").notNull(),
    fileId: p
      .text("fileId")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    vaultId: p
      .text("vaultId")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    noteIds: p.text("noteIds").array().notNull(),
    createdAt: p.timestamp("createdAt", { mode: "date" }).notNull(),
    accessedAt: p.timestamp("accessedAt", { mode: "date" }).notNull(),
    duration: p.integer("duration").notNull(),
    steering: p.jsonb("steering").$type<Steering>().notNull(),
  },
  (table) => [p.index("idx_reasonings_vault_filename").on(table.vaultId, table.fileId)],
)

export const reasoningsRelations = relations(reasonings, ({ one, many }) => ({
  file: one(files, {
    fields: [reasonings.fileId],
    references: [files.id],
  }),
  notes: many(notes),
}))

export const tasks = p.pgTable("tasks", {
  id: p
    .text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  status: p
    .text("status", {
      enum: ["in_progress", "success", "failure", "cancelled"],
    })
    .notNull()
    .default("in_progress"),
  createdAt: p.timestamp("createdAt", { mode: "date" }).notNull(),
  completedAt: p.timestamp("completedAt", { mode: "date" }),
  error: p.text("error"),
})
