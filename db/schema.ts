import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
export const files = sqliteTable("files", {
  id: text("id").primaryKey(), name: text("name").notNull(), size: integer("size").notNull(),
  mime: text("mime").notNull(), createdAt: integer("created_at").notNull(),
  status: text("status").notNull(), uploadId: text("upload_id").notNull(), tokenHash: text("token_hash").notNull(),
  ownerId: text("owner_id"), ownerSession: text("owner_session"), ipHash: text("ip_hash"), folderId: text("folder_id"),
}, (t) => [index("idx_files_status_created_id").on(t.status, t.createdAt, t.id)]);
export const parts = sqliteTable("parts", {
  fileId: text("file_id").notNull().references(() => files.id, { onDelete: "cascade" }),
  number: integer("number").notNull(), etag: text("etag").notNull(), size: integer("size").notNull(),
}, (t) => [primaryKey({ columns: [t.fileId, t.number] })]);
export const uploadLimits = sqliteTable("upload_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), expires: integer("expires").notNull(),
});
export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(), name: text("name").notNull(), ownerId: text("owner_id").notNull(),
  access: text("access").notNull(), groupId: text("group_id"), passwordHash: text("password_hash"), createdAt: integer("created_at").notNull(),
}, t => [index("idx_folders_owner").on(t.ownerId), index("idx_folders_group").on(t.groupId)]);
export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(), name: text("name").notNull(), ownerId: text("owner_id").notNull(), invite: text("invite").notNull().unique(), createdAt: integer("created_at").notNull(),
});
export const members = sqliteTable("members", {
  groupId: text("group_id").notNull(), userId: text("user_id").notNull(), name: text("name").notNull(), joinedAt: integer("joined_at").notNull(),
}, t => [primaryKey({ columns: [t.groupId, t.userId] }), index("idx_members_user").on(t.userId)]);
export const folderSessions = sqliteTable("folder_sessions", {
  folderId: text("folder_id").notNull(), session: text("session").notNull(), expires: integer("expires").notNull(),
}, t => [primaryKey({ columns: [t.folderId, t.session] })]);
export const cooldowns = sqliteTable("cooldowns", {
  ip: text("ip").primaryKey(), fileId: text("file_id").notNull(), nextAt: integer("next_at").notNull(),
});
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(), fileId: text("file_id").notNull(), reason: text("reason").notNull(), details: text("details").notNull(),
  reporter: text("reporter").notNull(), createdAt: integer("created_at").notNull(), status: text("status").notNull().default("open"),
}, t => [index("idx_reports_status_created").on(t.status, t.createdAt)]);
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(), groupId: text("group_id").notNull(), name: text("name").notNull(), ownerId: text("owner_id").notNull(),
  state: text("state").notNull().default(""), revision: integer("revision").notNull().default(0), createdAt: integer("created_at").notNull(), updatedAt: integer("updated_at").notNull(),
}, t => [index("idx_documents_group_updated").on(t.groupId, t.updatedAt)]);
export const presence = sqliteTable("presence", {
  documentId: text("document_id").notNull(), peerId: text("peer_id").notNull(), userId: text("user_id").notNull(), name: text("name").notNull(),
  sharing: integer("sharing").notNull().default(0), updatedAt: integer("updated_at").notNull(),
}, t => [primaryKey({ columns: [t.documentId, t.peerId] })]);
export const signals = sqliteTable("signals", {
  seq: integer("seq").primaryKey({ autoIncrement: true }), documentId: text("document_id").notNull(), sender: text("sender").notNull(),
  receiver: text("receiver").notNull(), payload: text("payload").notNull(), createdAt: integer("created_at").notNull(),
}, t => [index("idx_signals_document_receiver_seq").on(t.documentId, t.receiver, t.seq)]);
