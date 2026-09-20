import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const placeholderUrl = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || placeholderUrl,
  },
  strict: true,
  verbose: true,
});
