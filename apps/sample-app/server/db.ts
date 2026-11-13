import pg from "pg";

// Override with DATABASE_URL; the default matches docker-compose.yml.
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://sample:sample@localhost:5433/sample",
});
