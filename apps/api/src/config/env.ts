import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    hostname: /.+/,
  }),
  PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must contain at least 32 characters"),

  BETTER_AUTH_URL: z.url({
    protocol: /^https?$/,
    hostname: /.+/,
  }),

  WEB_ORIGIN: z
    .url({
      protocol: /^https?$/,
      hostname: /.+/,
    })
    .refine(
      (value) => value === new URL(value).origin,
      "WEB_ORIGIN must contain only scheme, hostname, and optional port",
    ),
});

export type Env = z.infer<typeof envSchema>;
