import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "postgresql://lingo:lingo_local_dev@localhost:5432/lingo";

const isSupabase =
  connectionString.includes("supabase.com") ||
  connectionString.includes("supabase.co") ||
  connectionString.includes("pooler");
const isProduction = process.env.NODE_ENV === "production";

export const client = postgres(connectionString, {
  max: isProduction ? 2 : 10,
  idle_timeout: 20,
  connect_timeout: 15,
  // Required for Supabase transaction pooler (port 6543) which does not support prepared statements
  prepare: false,
  ssl: isSupabase || isProduction || connectionString.includes("sslmode=require") ? "require" : undefined,
  onnotice: () => {},
});

export const db = drizzle(client, { schema });

// Cached probe to quickly skip DB queries if database is unreachable (e.g. local dev without Postgres)
let dbStatusCached: boolean | null = null;
let dbStatusCheckedAt = 0;

export async function isDbAvailable(): Promise<boolean> {
  const now = Date.now();
  // Cache check for 10 seconds if offline, 60 seconds if online
  if (dbStatusCached !== null) {
    const ttl = dbStatusCached ? 60000 : 10000;
    if (now - dbStatusCheckedAt < ttl) return dbStatusCached;
  }

  try {
    const checkPromise = client`SELECT 1`;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DB probe timeout")), 800)
    );
    await Promise.race([checkPromise, timeoutPromise]);
    dbStatusCached = true;
  } catch {
    dbStatusCached = false;
  }
  dbStatusCheckedAt = now;
  return dbStatusCached;
}

