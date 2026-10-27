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
import { mergeUserCookies } from "./helpers/cookies.js";

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
    const caller = { cookie: "" };
    mergeUserCookies(caller, signup.headers["set-cookie"]);
    const cookie = caller.cookie;
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
    mergeUserCookies(caller, signout.headers["set-cookie"]);
    expect(caller.cookie).toBe("");

    // 5. Replay the original cookie to verify server-side invalidation.
    const expiredSession = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { origin, cookie },
    });

    expect(expiredSession.statusCode).toBe(200);
    expect(expiredSession.json()).toBeNull();
  });

  it("signs in an existing user and creates a working session", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const email = `signin-${randomUUID()}@example.com`;
    const password = "Test-password-123!";
    const origin = "http://localhost:3000";

    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: { name: "Signin User", email, password },
    });

    expect(signup.statusCode).toBe(200);

    const userId = signup.json().user.id;
    const caller = { cookie: "" };
    mergeUserCookies(caller, signup.headers["set-cookie"]);
    expect(caller.cookie).not.toBe("");

    const signout = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin, cookie: caller.cookie },
      payload: {},
    });

    expect(signout.statusCode).toBe(200);
    mergeUserCookies(caller, signout.headers["set-cookie"]);
    expect(caller.cookie).toBe("");

    // Sign in without carrying the signup cookie.
    const signin = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin },
      payload: { email, password },
    });

    expect(signin.statusCode).toBe(200);
    expect(signin.json()).toMatchObject({
      user: { id: userId, email },
    });

    mergeUserCookies(caller, signin.headers["set-cookie"]);
    expect(caller.cookie).not.toBe("");

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: { origin, cookie: caller.cookie },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      user: { id: userId, email },
      session: {
        id: expect.any(String),
        userId,
      },
    });
  });

  it("rejects an incorrect password without authenticating the caller", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const email = `wrong-password-${randomUUID()}@example.com`;
    const origin = "http://localhost:3000";

    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin },
      payload: {
        name: "Password Test User",
        email,
        password: "Correct-password-123!",
      },
    });

    expect(signup.statusCode).toBe(200);

    // Do not pass the signup cookies to this request.
    const signin = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin },
      payload: {
        email,
        password: "Incorrect-password-123!",
      },
    });

    expect(signin.statusCode).toBe(401);
    expect(signin.json()).toMatchObject({
      code: "INVALID_EMAIL_OR_PASSWORD",
    });

    // Any cookies returned by the failed attempt must not authenticate.
    const caller = { cookie: "" };
    mergeUserCookies(caller, signin.headers["set-cookie"]);
    const session = await app.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: {
        origin,
        cookie: caller.cookie,
      },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toBeNull();
  });

  it("allows credentialed requests from the web origin", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const origin = "http://localhost:3000";

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/sign-in/email",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");

    const methods = String(response.headers["access-control-allow-methods"])
      .split(",")
      .map((value) => value.trim());

    const headers = String(response.headers["access-control-allow-headers"])
      .toLowerCase()
      .split(",")
      .map((value) => value.trim());

    expect(methods).toContain("POST");
    expect(headers).toContain("content-type");
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
