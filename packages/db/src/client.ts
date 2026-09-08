import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDb>;

const PLACEHOLDER_URL =
  "postgresql://user:password@ep.invalid.neon.tech/neondb?sslmode=require";

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle({ client: sql, schema });
}

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}

export function requireDatabaseUrl(): string {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

let cached: Database | undefined;

export function getDb(): Database {
  cached ??= createDb(requireDatabaseUrl());
  return cached;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

/** Neon-shaped URL so Better Auth CLI / module init can load without a real DB. */
export function databaseUrlForInit(): string {
  return getDatabaseUrl() ?? PLACEHOLDER_URL;
}

