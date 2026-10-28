import { eq } from "drizzle-orm";
import { DatabaseService } from "../src/database/database.service.js";
import { member } from "../src/database/schema/auth.js";
import { getSession, signUpUser } from "./helpers/auth.js";
import { createWorkspace, setActiveWorkspace } from "./helpers/workspaces.js";
import { setupTestApp } from "./helpers/test-app.js";

describe("Workspaces (e2e)", () => {
  const getApp = setupTestApp();

  it("creates a workspace with an owner membership for its creator", async () => {
    const app = getApp();

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
    const app = getApp();

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
    const app = getApp();

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
    const app = getApp();

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
});
