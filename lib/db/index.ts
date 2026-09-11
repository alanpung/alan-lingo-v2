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
