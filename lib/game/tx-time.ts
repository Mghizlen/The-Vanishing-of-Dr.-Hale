import "server-only";

import { sql } from "drizzle-orm";
import { toIsoTimestamp } from "@/lib/api/response";
import type { DbTx } from "@/lib/db/tx";

export async function databaseNow(tx: DbTx): Promise<string> {
  const result = await tx.execute(sql`select now() as now`);
  const rows = (result as { rows?: Array<{ now?: unknown }> }).rows;
  if (!rows?.[0]?.now) {
    throw new Error("Failed to read database time");
  }
  return toIsoTimestamp(rows[0].now);
}
