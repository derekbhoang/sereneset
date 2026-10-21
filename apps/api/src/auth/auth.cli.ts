import { loadEnvFile } from "node:process";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { envSchema } from "../config/env.js";
import { createAuth } from "./auth.js";
import * as schema from "../database/schema/auth.js";

loadEnvFile(new URL("../../.env", import.meta.url));

const env = envSchema.parse(process.env);

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

const db = drizzle({ client: pool });

export const auth = createAuth(
  db,
  schema,
  {
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    webOrigin: env.WEB_ORIGIN,
  },
);
