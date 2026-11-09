import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../src/database/database.service.js";
import { organization, user } from "../src/database/schema/auth.js";
import { project } from "../src/database/schema/project.js";
import { setupTestApp } from "./helpers/test-app.js";

describe("Project database integrity", () => {
  const getApp = setupTestApp();

  async function fixture() {
    const db = getApp().get(DatabaseService).db;
    const userId = randomUUID();
    const organizationId = randomUUID();

    // Bare rows isolate these tests from other authentication foreign keys.
    await db.insert(user).values({
      id: userId,
      name: "Creator",
      email: `${userId}@example.test`,
    });
    await db.insert(organization).values({
      id: organizationId,
      name: "Workspace",
      slug: `workspace-${organizationId}`,
      createdAt: new Date(),
    });

    return { db, userId, organizationId };
  }

  it.each([
    {
      field: "organizationId",
      constraint: "project_organization_id_organization_id_fk",
    },
    {
      field: "createdByUserId",
      constraint: "project_created_by_user_id_user_id_fk",
    },
  ] as const)("rejects a nonexistent $field", async ({ field, constraint }) => {
    const { db, userId, organizationId } = await fixture();
    const id = randomUUID();

    await expect(
      db
        .insert(project)
        .values({
          id,
          organizationId,
          createdByUserId: userId,
          name: "Invalid ownership",
          [field]: randomUUID(),
        })
        .execute(),
    ).rejects.toMatchObject({
      cause: { code: "23503", constraint },
    });

    expect(await db.select().from(project).where(eq(project.id, id))).toEqual(
      [],
    );
  });

  it("cascades only the deleted organization's projects and preserves users", async () => {
    const { db, userId, organizationId } = await fixture();
    const otherOrganizationId = randomUUID();
    const deletedIds = [randomUUID(), randomUUID()];
    const retainedId = randomUUID();

    await db.insert(organization).values({
      id: otherOrganizationId,
      name: "Other workspace",
      slug: `workspace-${otherOrganizationId}`,
      createdAt: new Date(),
    });
    await db.insert(project).values([
      ...deletedIds.map((id) => ({
        id,
        organizationId,
        createdByUserId: userId,
        name: "Delete with workspace",
      })),
      {
        id: retainedId,
        organizationId: otherOrganizationId,
        createdByUserId: userId,
        name: "Keep in other workspace",
      },
    ]);

    await db.delete(organization).where(eq(organization.id, organizationId));

    expect(
      await db
        .select({ id: project.id })
        .from(project)
        .where(inArray(project.id, [...deletedIds, retainedId])),
    ).toEqual([{ id: retainedId }]);

    expect(
      await db
        .select({ id: organization.id })
        .from(organization)
        .where(inArray(organization.id, [organizationId, otherOrganizationId])),
    ).toEqual([{ id: otherOrganizationId }]);

    expect(
      await db.select({ id: user.id }).from(user).where(eq(user.id, userId)),
    ).toEqual([{ id: userId }]);
  });

  it("restricts creator deletion until their project is removed", async () => {
    const { db, userId, organizationId } = await fixture();
    const id = randomUUID();

    await db.insert(project).values({
      id,
      organizationId,
      createdByUserId: userId,
      name: "Preserve attribution",
    });

    await expect(
      db.delete(user).where(eq(user.id, userId)).execute(),
    ).rejects.toMatchObject({
      cause: {
        code: "23001",
        constraint: "project_created_by_user_id_user_id_fk",
      },
    });

    expect(
      await db.select({ id: user.id }).from(user).where(eq(user.id, userId)),
    ).toEqual([{ id: userId }]);

    expect(
      await db
        .select({ id: project.id, createdByUserId: project.createdByUserId })
        .from(project)
        .where(eq(project.id, id)),
    ).toEqual([{ id, createdByUserId: userId }]);

    await db.delete(project).where(eq(project.id, id));

    expect(
      await db
        .delete(user)
        .where(eq(user.id, userId))
        .returning({ id: user.id }),
    ).toEqual([{ id: userId }]);

    expect(
      await db.select({ id: user.id }).from(user).where(eq(user.id, userId)),
    ).toEqual([]);
  });
});
