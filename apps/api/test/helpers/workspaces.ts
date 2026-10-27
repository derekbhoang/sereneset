import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { expect } from "vitest";
import type { TestUser } from "./auth.js";
import { mergeUserCookies } from "./cookies.js";

export type TestWorkspace = {
  id: string;
  name: string;
  slug: string;
};

type CreateWorkspaceOptions = {
  name?: string;
  slug?: string;
};

export async function createWorkspace(
  app: NestFastifyApplication,
  user: TestUser,
  {
    name = "Test Workspace",
    slug = `workspace-${randomUUID()}`,
  }: CreateWorkspaceOptions = {},
): Promise<TestWorkspace> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/organization/create",
    headers: {
      origin: "http://localhost:3000",
      cookie: user.cookie,
    },
    payload: { name, slug },
  });

  expect(response.statusCode).toBe(200);

  const workspace = response.json<TestWorkspace>();
  expect(workspace).toMatchObject({ id: expect.any(String), name, slug });
  mergeUserCookies(user, response.headers["set-cookie"]);

  return { id: workspace.id, name: workspace.name, slug: workspace.slug };
}

export async function setActiveWorkspace(
  app: NestFastifyApplication,
  user: TestUser,
  organizationId: string | null,
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/organization/set-active",
    headers: {
      origin: "http://localhost:3000",
      cookie: user.cookie,
    },
    payload: { organizationId },
  });

  mergeUserCookies(user, response.headers["set-cookie"]);

  // Return the raw response so tests can assert either success or rejection.
  return response;
}
