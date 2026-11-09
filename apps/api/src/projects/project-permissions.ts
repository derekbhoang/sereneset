import { ForbiddenException } from "@nestjs/common";
import type { WorkspaceContext } from "../auth/workspace.guard.js";

export type ProjectAction = "create" | "read" | "update" | "delete";

const crudActions: ReadonlySet<ProjectAction> = new Set([
  "create",
  "read",
  "update",
  "delete",
]);

const permissions: ReadonlyMap<string, ReadonlySet<ProjectAction>> = new Map([
  ["owner", crudActions],
  ["admin", crudActions],
  ["member", crudActions],
]);

export function assertProjectPermission(
  workspace: WorkspaceContext,
  action: ProjectAction,
): void {
  if (!permissions.get(workspace.role)?.has(action)) {
    throw new ForbiddenException({
      code: "PROJECT_PERMISSION_DENIED",
      message: "You do not have permission to perform this project action",
    });
  }
}
