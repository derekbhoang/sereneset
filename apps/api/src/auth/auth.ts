import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type AuthConfig = {
  secret: string;
  baseURL: string;
  webOrigin: string;
};

export function createAuth(
  db: NodePgDatabase,
  schema: Record<string, unknown>,
  config: AuthConfig,
) {
  return betterAuth({
    appName: "SereneSet",

    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,

    trustedOrigins: [config.webOrigin],

    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      camelCase: true,
      transaction: true,
    }),

    emailAndPassword: {
      enabled: true,
    },

    plugins: [organization()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
