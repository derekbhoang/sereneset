import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Project, ProjectListResponse } from "@sereneset/contracts";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../src/database/database.service.js";
import { member } from "../src/database/schema/auth.js";
import { project } from "../src/database/schema/project.js";
import { signUpUser, type TestUser } from "./helpers/auth.js";
import { mergeUserCookies } from "./helpers/cookies.js";
import { setupTestApp } from "./helpers/test-app.js";
import { createWorkspace, setActiveWorkspace } from "./helpers/workspaces.js";

async function request(
  app: NestFastifyApplication,
  user: TestUser,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
) {
  const response = await app.inject({
    method,
    url,
    headers: { origin: "http://localhost:3000", cookie: user.cookie },
    payload,
  });
  mergeUserCookies(user, response.headers["set-cookie"]);
  return response;
}

describe("Projects (e2e)", () => {
  const getApp = setupTestApp();

  it("uses current role permissions for every action on the same session", async () => {
    const app = getApp();
    const owner = await signUpUser(app);
    const workspace = await createWorkspace(app, owner);
    const db = app.get(DatabaseService).db;
    const created = await request(app, owner, "POST", "/api/projects", {
      name: "Protected project",
    });
    expect(created.statusCode).toBe(201);
    const original = Project.parse(created.json());

    const membership = and(
      eq(member.organizationId, workspace.id),
      eq(member.userId, owner.userId),
    );
    await db.update(member).set({ role: "guest" }).where(membership);

    const attempts = [
      { method: "POST", url: "/api/projects", payload: { name: "Forbidden" } },
      { method: "GET", url: "/api/projects" },
      { method: "GET", url: `/api/projects/${original.id}` },
      {
        method: "PATCH",
        url: `/api/projects/${original.id}`,
        payload: { name: "Forbidden" },
      },
      { method: "DELETE", url: `/api/projects/${original.id}` },
    ] as const;

    for (const attempt of attempts) {
      const response = await request(
        app,
        owner,
        attempt.method,
        attempt.url,
        "payload" in attempt ? attempt.payload : undefined,
      );
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "PROJECT_PERMISSION_DENIED",
      });
    }

    await db.update(member).set({ role: "member" }).where(membership);
    const restored = await request(app, owner, "GET", "/api/projects");
    expect(restored.statusCode).toBe(200);
    expect(ProjectListResponse.parse(restored.json())).toEqual({
      items: [original],
      nextCursor: null,
    });
  });

  it("performs CRUD while preserving ownership and omitted fields", async () => {
    const app = getApp();
    const owner = await signUpUser(app);
    const workspace = await createWorkspace(app, owner);
    const db = app.get(DatabaseService).db;
    const created = await request(app, owner, "POST", "/api/projects", {
      name: "  Original  ",
      description: "Keep this description",
    });
    expect(created.statusCode).toBe(201);
    const original = Project.parse(created.json());
    expect(original).toMatchObject({
      organizationId: workspace.id,
      createdByUserId: owner.userId,
      name: "Original",
    });

    const read = await request(
      app,
      owner,
      "GET",
      `/api/projects/${original.id}`,
    );
    expect(read.statusCode).toBe(200);
    expect(Project.parse(read.json())).toEqual(original);

    const editor = await signUpUser(app);
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: workspace.id,
      userId: editor.userId,
      role: "member",
      createdAt: new Date(),
    });
    expect(
      (await setActiveWorkspace(app, editor, workspace.id)).statusCode,
    ).toBe(200);
    const previousUpdatedAt = new Date("2020-01-01T00:00:00.000Z");
    await db
      .update(project)
      .set({ updatedAt: previousUpdatedAt })
      .where(
        and(
          eq(project.organizationId, workspace.id),
          eq(project.id, original.id),
        ),
      );

    const renamed = await request(
      app,
      editor,
      "PATCH",
      `/api/projects/${original.id}`,
      {
        name: "Renamed",
      },
    );
    expect(renamed.statusCode).toBe(200);
    const updated = Project.parse(renamed.json());
    expect(updated).toMatchObject({
      id: original.id,
      organizationId: workspace.id,
      createdByUserId: owner.userId,
      createdAt: original.createdAt,
      name: "Renamed",
      description: "Keep this description",
    });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      previousUpdatedAt.getTime(),
    );

    const cleared = await request(
      app,
      editor,
      "PATCH",
      `/api/projects/${original.id}`,
      {
        description: null,
      },
    );
    expect(cleared.statusCode).toBe(200);
    expect(Project.parse(cleared.json())).toMatchObject({
      name: "Renamed",
      description: null,
    });

    const listed = await request(app, owner, "GET", "/api/projects");
    expect(listed.statusCode).toBe(200);
    expect(ProjectListResponse.parse(listed.json())).toEqual({
      items: [Project.parse(cleared.json())],
      nextCursor: null,
    });
    const deleted = await request(
      app,
      owner,
      "DELETE",
      `/api/projects/${original.id}`,
    );
    expect(deleted.statusCode).toBe(204);
    expect(deleted.payload).toBe("");
    const missing = await request(
      app,
      owner,
      "GET",
      `/api/projects/${original.id}`,
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("isolates reads and mutations even when the caller belongs to both workspaces", async () => {
    const app = getApp();
    const owner = await signUpUser(app);
    const firstWorkspace = await createWorkspace(app, owner);
    const created = await request(app, owner, "POST", "/api/projects", {
      name: "First",
    });
    expect(created.statusCode).toBe(201);
    const original = Project.parse(created.json());

    await createWorkspace(app, owner);
    const listed = await request(app, owner, "GET", "/api/projects");
    expect(listed.statusCode).toBe(200);
    expect(ProjectListResponse.parse(listed.json())).toEqual({
      items: [],
      nextCursor: null,
    });
    for (const method of ["GET", "PATCH", "DELETE"] as const) {
      const rejected = await request(
        app,
        owner,
        method,
        `/api/projects/${original.id}`,
        method === "PATCH" ? { name: "Unauthorized change" } : undefined,
      );
      expect(rejected.statusCode).toBe(404);
      expect(rejected.json()).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    }

    expect(
      (await setActiveWorkspace(app, owner, firstWorkspace.id)).statusCode,
    ).toBe(200);
    const preserved = await request(
      app,
      owner,
      "GET",
      `/api/projects/${original.id}`,
    );
    expect(preserved.statusCode).toBe(200);
    expect(Project.parse(preserved.json())).toEqual(original);
  });

  it("paginates tied timestamps without repeats and rejects malformed cursors", async () => {
    const app = getApp();
    const owner = await signUpUser(app);
    const workspace = await createWorkspace(app, owner);
    const tiedAt = new Date("2026-01-01T00:00:00.123Z");
    const ids = [
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
    ];
    const newestId = randomUUID();
    await app
      .get(DatabaseService)
      .db.insert(project)
      .values([
        {
          id: newestId,
          name: "Newest",
          organizationId: workspace.id,
          createdByUserId: owner.userId,
          createdAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        ...ids.map((id) => ({
          id,
          name: "Tied",
          organizationId: workspace.id,
          createdByUserId: owner.userId,
          createdAt: tiedAt,
        })),
      ]);

    const firstResponse = await request(
      app,
      owner,
      "GET",
      "/api/projects?limit=2",
    );
    expect(firstResponse.statusCode).toBe(200);
    const first = ProjectListResponse.parse(firstResponse.json());
    expect(first.items.map((item) => item.id)).toEqual([newestId, ids[0]]);
    if (first.nextCursor === null)
      throw new Error("Expected another project page");

    const removed = await request(
      app,
      owner,
      "DELETE",
      `/api/projects/${ids[0]}`,
    );
    expect(removed.statusCode).toBe(204);
    const nextResponse = await request(
      app,
      owner,
      "GET",
      `/api/projects?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
    );
    expect(nextResponse.statusCode).toBe(200);
    const next = ProjectListResponse.parse(nextResponse.json());
    expect(next.items.map((item) => item.id)).toEqual(ids.slice(1));
    expect(next.nextCursor).toBeNull();

    const malformed = await request(
      app,
      owner,
      "GET",
      "/api/projects?cursor=not-a-cursor",
    );
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ code: "INVALID_PROJECT_CURSOR" });
    await createWorkspace(app, owner);
    const wrongWorkspace = await request(
      app,
      owner,
      "GET",
      `/api/projects?cursor=${encodeURIComponent(first.nextCursor)}`,
    );
    expect(wrongWorkspace.statusCode).toBe(400);
    expect(wrongWorkspace.json()).toMatchObject({
      code: "INVALID_PROJECT_CURSOR",
    });
  });
});
