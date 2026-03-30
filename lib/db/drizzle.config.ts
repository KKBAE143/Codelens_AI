import { defineConfig } from "drizzle-kit";
import path from "path";

const rawDbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!rawDbUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

let dbUrl = rawDbUrl;
if (dbUrl.includes("neon.tech") && !dbUrl.includes("sslmode=")) {
  const separator = dbUrl.includes("?") ? "&" : "?";
  dbUrl = `${dbUrl}${separator}sslmode=require`;
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
});
