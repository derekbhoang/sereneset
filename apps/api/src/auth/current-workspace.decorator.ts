import {
  createParamDecorator,
  InternalServerErrorException,
} from "@nestjs/common";
import type {
  WorkspaceContext,
  WorkspaceRequest,
} from "./workspace.guard.js";

export const CurrentWorkspace = createParamDecorator<
  undefined,
  WorkspaceContext
>((_data, context) => {
  const { workspace } = context
    .switchToHttp()
    .getRequest<WorkspaceRequest>();

  if (!workspace) {
    throw new InternalServerErrorException(
      "Workspace context unavailable",
    );
  }

  return workspace;
});
