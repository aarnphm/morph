CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "fileEmbeddings" (
	"vaultId" text NOT NULL,
	"fileId" text NOT NULL,
	"chunkId" uuid NOT NULL,
	"embedding" vector(1536),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fileEmbeddings_vaultId_fileId_chunkId_pk" PRIMARY KEY("vaultId","fileId","chunkId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "files" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"extension" text NOT NULL,
	"vaultId" text NOT NULL,
	"lastModified" timestamp DEFAULT now() NOT NULL,
	"embeddingStatus" text DEFAULT 'in_progress' NOT NULL,
	"embeddingTaskId" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "noteEmbeddings" (
	"noteId" text PRIMARY KEY NOT NULL,
	"embedding" vector(1536),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"color" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"accessedAt" timestamp NOT NULL,
	"dropped" boolean DEFAULT false NOT NULL,
	"fileId" text NOT NULL,
	"vaultId" text NOT NULL,
	"reasoningId" text NOT NULL,
	"steering" jsonb NOT NULL,
	"embeddingStatus" text DEFAULT 'in_progress' NOT NULL,
	"embeddingTaskId" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reasonings" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"fileId" text NOT NULL,
	"vaultId" text NOT NULL,
	"noteIds" text[] NOT NULL,
	"createdAt" timestamp NOT NULL,
	"accessedAt" timestamp NOT NULL,
	"duration" integer NOT NULL,
	"steering" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "references" (
	"id" text PRIMARY KEY NOT NULL,
	"fileId" text NOT NULL,
	"vaultId" text NOT NULL,
	"handleId" text NOT NULL,
	"format" text NOT NULL,
	"path" text NOT NULL,
	"lastModified" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"createdAt" timestamp NOT NULL,
	"completedAt" timestamp,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lastOpened" timestamp DEFAULT now() NOT NULL,
	"tree" jsonb NOT NULL,
	"settings" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fileEmbeddings" ADD CONSTRAINT "fileEmbeddings_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fileEmbeddings" ADD CONSTRAINT "fileEmbeddings_fileId_files_id_fk" FOREIGN KEY ("fileId") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_embeddingTaskId_tasks_id_fk" FOREIGN KEY ("embeddingTaskId") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteEmbeddings" ADD CONSTRAINT "noteEmbeddings_noteId_notes_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_fileId_files_id_fk" FOREIGN KEY ("fileId") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_reasoningId_reasonings_id_fk" FOREIGN KEY ("reasoningId") REFERENCES "public"."reasonings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_embeddingTaskId_tasks_id_fk" FOREIGN KEY ("embeddingTaskId") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasonings" ADD CONSTRAINT "reasonings_fileId_files_id_fk" FOREIGN KEY ("fileId") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reasonings" ADD CONSTRAINT "reasonings_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_fileId_files_id_fk" FOREIGN KEY ("fileId") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "references" ADD CONSTRAINT "references_vaultId_vaults_id_fk" FOREIGN KEY ("vaultId") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_ipIndex_hnsw" ON "fileEmbeddings" USING hnsw ("embedding" vector_ip_ops) WITH (m=16,ef_construction=50);--> statement-breakpoint
CREATE INDEX "idx_files_vault_filename" ON "files" USING btree ("vaultId","name");--> statement-breakpoint
CREATE INDEX "note_ipIndex_hnsw" ON "noteEmbeddings" USING hnsw ("embedding" vector_ip_ops) WITH (m=16,ef_construction=50);--> statement-breakpoint
CREATE INDEX "idx_notes_vault_filename" ON "notes" USING btree ("vaultId","fileId");--> statement-breakpoint
CREATE INDEX "idx_notes_reasoning" ON "notes" USING btree ("reasoningId");--> statement-breakpoint
CREATE INDEX "idx_reasonings_vault_filename" ON "reasonings" USING btree ("vaultId","fileId");
