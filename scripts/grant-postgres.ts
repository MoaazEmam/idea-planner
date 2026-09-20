import "dotenv/config";
import postgres from "postgres";

/**
 * Migrations run as the `idea_app` role, which therefore owns the tables.
 * The Supabase dashboard table editor and the Supabase MCP server both connect
 * as `postgres`, so they need explicit grants to see the app's data.
 *
 * Run after every migration:  npm run db:grant
 * The ALTER DEFAULT PRIVILEGES lines cover tables created by future migrations.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    await sql.unsafe(`
      GRANT USAGE ON SCHEMA public TO postgres;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
    `);

    const [drizzleSchema] = await sql`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'drizzle'
    `;
    if (drizzleSchema) {
      await sql.unsafe(`
        GRANT USAGE ON SCHEMA drizzle TO postgres;
        GRANT ALL ON ALL TABLES IN SCHEMA drizzle TO postgres;
      `);
    }

    console.log("Granted management access to the postgres role.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
