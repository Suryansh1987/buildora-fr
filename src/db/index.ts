import { drizzle } from "drizzle-orm/neon-http";
import type {
  messages,
  projectFiles,
  projects,
  users,
  userUsage,
} from "./schema";

export const db = drizzle(import.meta.env.VITE_DATABASE_URL);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type NewProjectFile = typeof projectFiles.$inferInsert;
export type UserUsage = typeof userUsage.$inferSelect;
export type NewUserUsage = typeof userUsage.$inferInsert;
