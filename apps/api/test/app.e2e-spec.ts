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
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { configureApp } from "../src/configure-app.js";
import { randomUUID } from "node:crypto";
import { mergeUserCookies } from "./helpers/cookies.js";
import { getSession, signUpUser } from "./helpers/auth.js";
import { createWorkspace, setActiveWorkspace } from "./helpers/workspaces.js";
import { DatabaseService } from "../src/database/database.service.js";
import { member } from "../src/database/schema/auth.js";

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
    const caller = await signUpUser(app, { email });

    // 2. Save the original cookie for replay after signout.
    const cookie = caller.cookie;

    // 3. Confirm the cookie authenticates the registered user.
    const session = await getSession(app, caller);

    expect(session).toMatchObject({
      user: {
        id: caller.userId,
        email,
        name: "Test User",
      },
      session: {
        id: expect.any(String),
        userId: caller.userId,
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
    const expiredSession = await getSession(app, { cookie });

    expect(expiredSession).toBeNull();
  });

  it("signs in an existing user and creates a working session", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const email = `signin-${randomUUID()}@example.com`;
    const password = "Test-password-123!";
    const origin = "http://localhost:3000";

    const caller = await signUpUser(app, {
      name: "Signin User",
      email,
      password,
    });
    const userId = caller.userId;

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

    const session = await getSession(app, caller);

    expect(session).toMatchObject({
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

    await signUpUser(app, {
      name: "Password Test User",
      email,
      password: "Correct-password-123!",
    });

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
    const session = await getSession(app, caller);

    expect(session).toBeNull();
  });

  it("creates a workspace with an owner membership for its creator", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const owner = await signUpUser(app);
    const workspace = await createWorkspace(app, owner);
    const db = app.get(DatabaseService).db;

    const memberships = await db
      .select({
        userId: member.userId,
        organizationId: member.organizationId,
        role: member.role,
      })
      .from(member)
      .where(eq(member.organizationId, workspace.id));

    expect(memberships).toEqual([
      {
        userId: owner.userId,
        organizationId: workspace.id,
        role: "owner",
      },
    ]);
  });

  it("lists only the authenticated user's workspaces", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const owner = await signUpUser(app);
    const otherUser = await signUpUser(app);
    const firstWorkspace = await createWorkspace(app, owner);
    const secondWorkspace = await createWorkspace(app, owner);
    const otherWorkspace = await createWorkspace(app, otherUser);

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/organization/list",
      headers: { origin: "http://localhost:3000", cookie: owner.cookie },
    });

    expect(response.statusCode).toBe(200);
    const workspaces = response.json();
    expect(workspaces).toHaveLength(2);
    expect(workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining(firstWorkspace),
        expect.objectContaining(secondWorkspace),
      ]),
    );

    const otherResponse = await app.inject({
      method: "GET",
      url: "/api/auth/organization/list",
      headers: { origin: "http://localhost:3000", cookie: otherUser.cookie },
    });

    expect(otherResponse.statusCode).toBe(200);
    expect(otherResponse.json()).toEqual([
      expect.objectContaining(otherWorkspace),
    ]);
  });

  it("selects a workspace and persists it in the user's session", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const owner = await signUpUser(app);
    const workspace = await createWorkspace(app, owner);

    // Creation activates the workspace, so clear it to exercise selection.
    const cleared = await setActiveWorkspace(app, owner, null);
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toBeNull();
    expect(await getSession(app, owner)).toMatchObject({
      session: { userId: owner.userId, activeOrganizationId: null },
    });

    const selected = await setActiveWorkspace(app, owner, workspace.id);
    expect(selected.statusCode).toBe(200);
    expect(selected.json()).toMatchObject(workspace);
    expect(await getSession(app, owner)).toMatchObject({
      user: { id: owner.userId },
      session: {
        userId: owner.userId,
        activeOrganizationId: workspace.id,
      },
    });
  });

  it("rejects workspace selection by a non-member", async () => {
    if (!app) throw new Error("Test app was not initialized");

    const owner = await signUpUser(app);
    const workspace = await createWorkspace(app, owner);
    const outsider = await signUpUser(app);

    const response = await setActiveWorkspace(app, outsider, workspace.id);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
    });
    expect(await getSession(app, outsider)).toMatchObject({
      user: { id: outsider.userId },
      session: { userId: outsider.userId, activeOrganizationId: null },
    });

    const db = app.get(DatabaseService).db;
    const memberships = await db
      .select()
      .from(member)
      .where(eq(member.userId, outsider.userId));

    expect(memberships).toEqual([]);
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
