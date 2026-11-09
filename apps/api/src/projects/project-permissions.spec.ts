import { ForbiddenException } from "@nestjs/common";
import type { WorkspaceContext } from "../auth/workspace.guard.js";
import {
  assertProjectPermission,
  type ProjectAction,
} from "./project-permissions.js";

const workspace: WorkspaceContext = {
  userId: "user-1",
  organizationId: "workspace-1",
  memberId: "membership-1",
  role: "member",
};

const actions: ProjectAction[] = ["create", "read", "update", "delete"];

describe("Project permissions", () => {
  describe.each(["owner", "admin", "member"])("%s", (role) => {
    it.each(actions)("allows %s", (action) => {
      expect(() =>
        assertProjectPermission({ ...workspace, role }, action),
      ).not.toThrow();
    });
  });

  describe.each(["guest", "", "OWNER", "__proto__", "constructor"])(
    "unrecognized role %j",
    (role) => {
      it.each(actions)("denies %s with a structured 403", (action) => {
        const check = () =>
          assertProjectPermission({ ...workspace, role }, action);

        expect(check).toThrow(ForbiddenException);
        expect(check).toThrowError(
          expect.objectContaining({
            status: 403,
            response: {
              code: "PROJECT_PERMISSION_DENIED",
              message:
                "You do not have permission to perform this project action",
            },
          }),
        );
      });
    },
  );
});
