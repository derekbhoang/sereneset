import { z } from 'zod';

const trimmedUrl = (protocol: RegExp) =>
  z.string().trim().pipe(z.url({ protocol }));

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),

  WEB_ORIGIN: trimmedUrl(/^https?$/).default('http://localhost:3000'),

  DATABASE_URL: trimmedUrl(/^postgres(?:ql)?$/),

  REDIS_URL: trimmedUrl(/^rediss?$/),
});

export type EnvironmentVariables = z.infer<typeof envSchema>;

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}
