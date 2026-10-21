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
});

export type Env = z.infer<typeof envSchema>;
