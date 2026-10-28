import { fileURLToPath } from "node:url";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, vi } from "vitest";
import { configureApp } from "../../src/configure-app.js";

// Call inside a describe block. Each suite gets its own app and database.
export function setupTestApp(): () => NestFastifyApplication {
  let app: NestFastifyApplication | undefined;
  let container: StartedPostgreSqlContainer | undefined;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18")
      .withDatabase("sereneset_test")
      .start();

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", container.getConnectionUri());
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "integration-test-secret-at-least-32-characters",
    );
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:9000");
    vi.stubEnv("WEB_ORIGIN", "http://localhost:3000");
    vi.stubEnv("PORT", "9000");

    const pool = new Pool({
      connectionString: container.getConnectionUri(),
    });

    try {
      await migrate(drizzle({ client: pool }), {
        migrationsFolder: fileURLToPath(
          new URL("../../drizzle", import.meta.url),
        ),
      });
    } finally {
      await pool.end();
    }

    // Import after setting the test environment.
    const { AppModule } = await import("../../src/app.module.js");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      try {
        await container?.stop();
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });

  return () => {
    if (!app) throw new Error("Test app was not initialized");
    return app;
  };
}
