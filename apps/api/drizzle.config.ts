import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";
import { envSchema } from "./src/config/env.ts";

if (existsSync(".env")) {
  loadEnvFile(".env");
}

const env = envSchema
  .pick({ DATABASE_URL: true })
  .parse(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema/*.ts",
  out: "./drizzle",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});