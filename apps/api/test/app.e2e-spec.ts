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
import { configureApp } from "../src/configure-app.js";
import { randomUUID } from "node:crypto";

describe("AppController (e2e)", () => {
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
          new URL("../drizzle", import.meta.url),
        ),
      });
    } finally {
      await pool.end();
    }

    // Import after setting the test environment.
    const { AppModule } = await import("../src/app.module.js");

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

  it("/ (GET)", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toBe("Hello World!");
  });

  it("creates a session on signup and invalidates it on signout", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const email = `auth-${randomUUID()}@example.com`;
    const origin = "http://localhost:3000";

    // 1. Register a user.
    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: {
        name: "Test User",
        email,
        password: "Test-password-123!",
      },
    });

    expect(signup.statusCode).toBe(200);
    expect(signup.json()).toMatchObject({
      user: { email, name: "Test User" },
    });

    const signupUser = signup.json().user;

    // 2. Convert response Set-Cookie headers into a request Cookie header.
    const setCookie = signup.headers["set-cookie"];

    if (!setCookie) {
      throw new Error("Signup did not return a session cookie");
    }

    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .map((value) => value.split(";")[0])
      .join("; ");

    expect(cookie).not.toBe("");

    // 3. Confirm the cookie authenticates the registered user.
    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { origin, cookie },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      user: {
        id: signupUser.id,
        email,
        name: "Test User",
      },
      session: {
        id: expect.any(String),
        userId: signupUser.id,
      },
    });

    // 4. Sign out.
    const signout = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin, cookie },
      payload: {},
    });

    expect(signout.statusCode).toBe(200);
    expect(signout.json()).toMatchObject({ success: true });

    // 5. Replay the original cookie to verify server-side invalidation.
    const expiredSession = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { origin, cookie },
    });

    expect(expiredSession.statusCode).toBe(200);
    expect(expiredSession.json()).toBeNull();
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
});
