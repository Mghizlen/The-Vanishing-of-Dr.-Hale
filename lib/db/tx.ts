import "server-only";

import { db } from "@/lib/db/client";

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
