import "dotenv/config";
import { defineConfig } from "prisma/config";

// Placeholder lets `prisma generate` / postinstall work when DATABASE_URL is not set yet.
const databaseUrl =
  process.env["DATABASE_URL"] ||
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
