import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { user, session } from "./auth-schema";
import { branches } from "./branch-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const userInvitations = pgTable(
  "user_invitations",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id),
    tokenHash: text("token_hash").notNull().unique(),
    generation: uuid("generation").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    expiresAt: at("expires_at").notNull(),
    activatedAt: at("activated_at"),
    messageCiphertext: text("message_ciphertext"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [index("user_invitations_expiry").on(t.expiresAt)],
);
export const invitationRequests = pgTable("invitation_requests", {
  requestId: uuid("request_id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  generation: uuid("generation").notNull(),
  fingerprint: text("fingerprint").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});
export const identityEnrollmentGrants = pgTable("identity_enrollment_grants", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  expiresAt: at("expires_at").notNull(),
  consumedAt: at("consumed_at"),
  createdAt: at("created_at").notNull().defaultNow(),
});
