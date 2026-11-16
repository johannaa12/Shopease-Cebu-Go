import "dotenv/config";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import db, { initialize, pool } from "./mysql.js";

const sourcePath = fileURLToPath(new URL("./shopease.sqlite", import.meta.url));
const tables = [
  "users",
  "stores",
  "products",
  "orders",
  "order_items",
  "favorites",
  "reviews",
  "notifications",
  "order_store_status",
  "support_tickets",
  "auth_otps",
  "platform_settings",
  "coupons",
];

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });

try {
  await initialize();
  for (const table of tables) {
    const exists = source.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
    ).get(table);
    if (!exists) continue;

    const rows = source.prepare(`SELECT * FROM "${table}"`).all();
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    const columnList = columns.map((column) => `\`${column}\``).join(",");
    const placeholders = columns.map(() => "?").join(",");
    const insert = db.prepare(
      `INSERT IGNORE INTO ${table} (${columnList}) VALUES (${placeholders})`,
    );
    let copied = 0;
    for (const row of rows) {
      const result = await insert.run(...columns.map((column) => row[column]));
      copied += result.changes;
    }
    console.log(`${table}: migrated ${copied} of ${rows.length} rows`);
  }
} finally {
  source.close();
  await pool.end();
}
