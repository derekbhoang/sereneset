import {
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.js";

export const project = pgTable(
  "project",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),

    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("project_organization_id_unique").on(
      table.organizationId,
      table.id,
    ),
    index("project_organization_created_at_id_idx").on(
      table.organizationId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("project_created_by_user_id_idx").on(
      table.createdByUserId,
    ),
  ],
);
