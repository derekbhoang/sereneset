import { UseGuards } from "@nestjs/common";
import { SessionGuard } from "./session.guard.js";
import { WorkspaceGuard } from "./workspace.guard.js";

export function RequireWorkspace() {
  return UseGuards(SessionGuard, WorkspaceGuard);
}
