import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: varchar("clerk_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  profileImage: text("profile_image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  projectType: varchar("project_type", { length: 100 }),
  generatedCode: jsonb("generated_code"),
  deploymentUrl: text("deployment_url"),
  githubUrl: text("github_url"),

  conversationTitle: varchar("conversation_title", { length: 255 }).default(
    "Project Chat"
  ),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  role: varchar("role", { length: 20 }).notNull(), // user, assistant, system
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Project files table (to track generated files)
export const projectFiles = pgTable("project_files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .references(() => projects.id)
    .notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: text("file_path").notNull(),
  fileContent: text("file_content"),
  fileType: varchar("file_type", { length: 50 }), // js, jsx, css, html, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User usage tracking (for billing/limits)
export const userUsage = pgTable("user_usage", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM format
  tokensUsed: integer("tokens_used").default(0).notNull(),
  projectsCreated: integer("projects_created").default(0).notNull(),
  messagesCount: integer("messages_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Define relationships
export const usersRelations = relations(users, ({ many }: any) => ({
  projects: many(projects),
  usage: many(userUsage),
}));

export const projectsRelations = relations(projects, ({ one, many }: any) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  messages: many(messages), // Direct relationship with messages
  files: many(projectFiles),
}));

export const messagesRelations = relations(messages, ({ one }: any) => ({
  project: one(projects, {
    fields: [messages.projectId],
    references: [projects.id],
  }),
}));

export const projectFilesRelations = relations(
  projectFiles,
  ({ one }: any) => ({
    project: one(projects, {
      fields: [projectFiles.projectId],
      references: [projects.id],
    }),
  })
);

export const userUsageRelations = relations(userUsage, ({ one }: any) => ({
  user: one(users, {
    fields: [userUsage.userId],
    references: [users.id],
  }),
}));
