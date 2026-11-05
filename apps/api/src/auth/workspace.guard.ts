import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import { member } from "../database/schema/auth.js";
import type { SessionRequest } from "./session.guard.js";

export type WorkspaceContext = Readonly<{
  userId: string;
  organizationId: string;
  memberId: string;
  role: string;
}>;

export type WorkspaceRequest = SessionRequest & {
  workspace?: WorkspaceContext;
};

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<WorkspaceRequest>();

    const auth = request.auth;

    if (!auth) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }

    const userId = auth.user.id;
    const organizationId = auth.session.activeOrganizationId;

    if (!organizationId) {
      throw new ConflictException({
        code: "ACTIVE_WORKSPACE_REQUIRED",
        message: "Select a workspace before continuing",
      });
    }

    const [membership] = await this.database.db
      .select({
        memberId: member.id,
        role: member.role,
      })
      .from(member)
      .where(
        and(
          eq(member.organizationId, organizationId),
          eq(member.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new ForbiddenException({
        code: "WORKSPACE_ACCESS_DENIED",
        message: "Access to the selected workspace is denied",
      });
    }

    request.workspace = {
      userId,
      organizationId,
      memberId: membership.memberId,
      role: membership.role,
    };

    return true;
  }
}
