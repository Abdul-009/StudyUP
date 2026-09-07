/**
 * Applies the hand-authored SQL migration folders that aren't tracked by
 * `prisma migrate`. Order matters. Safe to re-run: each statement is plain DDL
 * and Postgres will error on a duplicate object, which this script surfaces.
 *
 *   node scripts/apply-pending-migrations.mjs
 *
 * Reads DIRECT_URL from .env.local.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL / DATABASE_URL not found in .env.local");
  process.exit(2);
}

// The migrations added since read-receipts / push / attachments work.
const PENDING = [
  "add_push_subscriptions",
  "add_read_receipts",
  "add_read_receipts_rls",
  "add_read_receipts_realtime",
  "add_message_attachments",
  // Sets REPLICA IDENTITY FULL on "Message" so Realtime reliably delivers
  // UPDATE events (e.g. soft-delete) to clients filtering by groupId — without
  // it, group-chat delete-state updates can silently fail to propagate live.
  "add_message_notification_replica_identity",
  // isEdited/editedAt columns for the message-editing feature.
  "add_message_editing",
  // MENTION NotifType value + Message.mentionedUserIds for @mentions.
  "add_message_mentions",
  // User.lastSeenAt for online/last-seen status.
  "add_user_last_seen",
  // Composite (groupId/conversationId, createdAt) indexes backing cursor-based
  // message pagination. Idempotent (CREATE INDEX IF NOT EXISTS).
  "add_message_pagination_indexes",
  // "Group" in the realtime publication, so name/description/color edits
  // propagate live to anyone with that group's chat open.
  "add_group_realtime",
  // ASSIGNMENT_REMINDER NotifType value — must run before the next migration,
  // which references it in a partial index (same-transaction restriction).
  "add_assignment_reminder_notif_type",
  // AssignmentCompletion: completedAt NOT NULL, denormalized groupId +
  // realtime, and the reminder-notification dedup index.
  "add_assignment_completion_tracking",
];

for (const name of PENDING) {
  const file = resolve(root, "prisma/migrations", name, "migration.sql");
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    execFileSync(
      "npx",
      ["prisma", "db", "execute", "--url", url, "--file", file],
      { stdio: "inherit", cwd: root, shell: process.platform === "win32" },
    );
    console.log(`OK ${name}`);
  } catch {
    console.error(`FAILED ${name} — fix and re-run (later migrations were skipped).`);
    process.exit(1);
  }
}

console.log("\nAll pending migrations applied.");
