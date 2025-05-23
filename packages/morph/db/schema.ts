import { createId } from "@paralleldrive/cuid2"
import { relations } from "drizzle-orm"
import * as p from "drizzle-orm/pg-core"

import { FileSystemTreeNodeDb, Settings, Steering } from "@/db/interfaces"

export const vaults = p.pgTable("vaults", {
  id: p
    .text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  name: p.text("name").notNull(),
  lastOpened: p.timestamp("lastOpened", { mode: "date" }).notNull().defaultNow(),
  tree: p.jsonb("tree").$type<FileSystemTreeNodeDb>().notNull(),
  settings: p.jsonb("settings").$type<Settings>().notNull(),
  rootPath: p.text("rootPath").notNull(),
})

export const vaultsRelations = relations(vaults, ({ many }) => ({
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

export const filesRelations = relations(files, ({ one }) => ({
  vault: one(vaults, {
    fields: [files.vaultId],
    references: [vaults.id],
  }),
}))

export const authors = p.pgTable("authors", {
  id: p
    .text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  fileId: p
    .text("fileId")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  queries: p.text("queries").array(),
  recommendedAuthors: p.text("recommendedAuthors").array().notNull(),
  createdAt: p.timestamp("createdAt", { mode: "date" }).notNull(),
  authorStatus: p
    .text("authorStatus", {
      enum: ["in_progress", "success", "failure", "cancelled"],
    })
    .notNull()
    .default("in_progress"),
  authorTaskId: p.text("authorTaskId").references(() => tasks.id),
})

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
    steering: p.jsonb("steering").$type<Steering | null>(),
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
    steering: p.jsonb("steering").$type<Steering | null>(),
  },
  (table) => [p.index("idx_reasonings_vault_filename").on(table.vaultId, table.fileId)],
)

export const reasoningsRelations = relations(reasonings, ({ many }) => ({
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

// Vector storage tables for embeddings
// For M and ef_construction, check service.py#API
export const noteEmbeddings = p.pgTable(
  "noteEmbeddings",
  {
    noteId: p
      .text("noteId")
      .primaryKey()
      .references(() => notes.id, { onDelete: "cascade" }),
    embedding: p.vector("embedding", { dimensions: 1536 }),
    createdAt: p.timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    p
      .index("note_ipIndex_hnsw")
      .using("hnsw", table.embedding.op("vector_ip_ops"))
      .with({ m: 16, ef_construction: 50 }),
  ],
)

export const noteEmbeddingsRelations = relations(noteEmbeddings, ({ one }) => ({
  note: one(notes, {
    fields: [noteEmbeddings.noteId],
    references: [notes.id],
  }),
}))

export const fileEmbeddings = p.pgTable(
  "fileEmbeddings",
  {
    vaultId: p
      .text("vaultId")
      .notNull()
      .references(() => vaults.id, { onDelete: "cascade" }),
    fileId: p
      .text("fileId")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    nodeId: p.text("nodeId").notNull(), // This is uuid, but from the server
    embedding: p.vector("embedding", { dimensions: 1536 }),
    metadataSeparator: p.text("metadataSeparator").notNull(),
    createdAt: p.timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    lineNumbers: p.jsonb("lineNumbers").$type<number[]>(),
    startLine: p.integer("startLine"),
    endLine: p.integer("endLine"),
    lineMap: p.jsonb("lineMap").$type<Record<string, string>>(),
    documentTitle: p.text("documentTitle"),
  },
  (table) => [
    p.primaryKey({ columns: [table.vaultId, table.fileId, table.nodeId] }),
    p.index("file_ipIndex_hnsw").using("hnsw", table.embedding.op("vector_ip_ops")).with({
      m: 16,
      ef_construction: 50,
    }),
  ],
)

export const fileEmbeddingsRelations = relations(fileEmbeddings, ({ one }) => ({
  file: one(files, {
    fields: [fileEmbeddings.fileId],
    references: [files.id],
  }),
}))
