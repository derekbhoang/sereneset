import { Test } from "@nestjs/testing";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { vi } from "vitest";
import type { WorkspaceContext } from "../auth/workspace.guard.js";
import { DatabaseService } from "../database/database.service.js";
import { ProjectsService } from "./projects.service.js";

const workspace: WorkspaceContext = {
  userId: "user-1",
  organizationId: "workspace-1",
  memberId: "membership-1",
  role: "guest",
};
const projectId = "3c1a996a-b475-4d33-a87d-e23cb2af606e";

const operations = [
  [
    "create",
    (service: ProjectsService) =>
      service.create(workspace, { name: "Project" }),
  ],
  // A forbidden caller should not reach cursor validation either.
  [
    "list",
    (service: ProjectsService) =>
      service.list(workspace, { limit: 25, cursor: "invalid" }),
  ],
  [
    "findOne",
    (service: ProjectsService) => service.findOne(workspace, projectId),
  ],
  [
    "update",
    (service: ProjectsService) =>
      service.update(workspace, projectId, { name: "Changed" }),
  ],
  [
    "remove",
    (service: ProjectsService) => service.remove(workspace, projectId),
  ],
] as const;

describe("ProjectsService permissions", () => {
  const query = vi.fn(() => {
    throw new Error("Unauthorized database access");
  });
  let service: ProjectsService;

  beforeEach(async () => {
    query.mockClear();

    // Exercise the real service, policy, and Drizzle query builders.
    const db = drizzle({ client: { query } as unknown as Pool });
    const module = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: DatabaseService, useValue: { db } },
      ],
    }).compile();
    service = module.get(ProjectsService);
  });

  it.each(operations)(
    "rejects %s before database access",
    async (_name, run) => {
      await expect(run(service)).rejects.toMatchObject({
        status: 403,
        response: {
          code: "PROJECT_PERMISSION_DENIED",
          message: "You do not have permission to perform this project action",
        },
      });
      expect(query).not.toHaveBeenCalled();
    },
  );
});
