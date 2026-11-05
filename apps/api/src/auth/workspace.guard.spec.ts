import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DrizzleQueryError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, QueryConfig } from "pg";
import { vi } from "vitest";
import { DatabaseService } from "../database/database.service.js";
import type { AuthSession } from "./session.guard.js";
import { WorkspaceGuard, type WorkspaceRequest } from "./workspace.guard.js";

type MembershipQuery = (
  config: QueryConfig,
  params: unknown[],
) => Promise<{ rows: [memberId: string, role: string][] }>;

function httpContext(request: Partial<WorkspaceRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("WorkspaceGuard", () => {
  const query = vi.fn<MembershipQuery>();

  let guard: WorkspaceGuard;
  let auth: AuthSession;
  let request: Partial<WorkspaceRequest>;
  let context: ExecutionContext;

  beforeEach(async () => {
    query.mockReset().mockResolvedValue({ rows: [["member-1", "member"]] });

    // Keep query compilation real; replace only the database I/O boundary.
    const db = drizzle({ client: { query } as unknown as Pool });
    const module = await Test.createTestingModule({
      providers: [
        WorkspaceGuard,
        { provide: DatabaseService, useValue: { db } },
      ],
    }).compile();
    guard = module.get(WorkspaceGuard);

    const now = new Date("2026-01-01T00:00:00.000Z");
    auth = {
      user: {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      session: {
        id: "session-1",
        token: "session-token",
        userId: "user-1",
        activeOrganizationId: "organization-1",
        expiresAt: new Date("2100-01-01T00:00:00.000Z"),
        createdAt: now,
        updatedAt: now,
      },
    };
    request = { auth };
    context = httpContext(request);
  });

  it("rejects an unauthenticated request without querying membership", async () => {
    request.auth = undefined;

    const result = guard.canActivate(context);

    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(result).rejects.toMatchObject({
      status: 401,
      response: {
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      },
    });
    expect(query).not.toHaveBeenCalled();
    expect(request.workspace).toBeUndefined();
  });

  it.each([null, undefined, ""])(
    "requires a selected workspace when activeOrganizationId is %s",
    async (organizationId) => {
      auth.session.activeOrganizationId = organizationId;

      const result = guard.canActivate(context);

      await expect(result).rejects.toBeInstanceOf(ConflictException);
      await expect(result).rejects.toMatchObject({
        status: 409,
        response: {
          code: "ACTIVE_WORKSPACE_REQUIRED",
          message: "Select a workspace before continuing",
        },
      });
      expect(query).not.toHaveBeenCalled();
      expect(request.workspace).toBeUndefined();
    },
  );

  it.each(["owner", "admin", "member"])(
    "allows a current %s and attaches the authorized workspace context",
    async (role) => {
      query.mockResolvedValue({ rows: [["member-1", role]] });

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(request.workspace).toEqual({
        userId: "user-1",
        organizationId: "organization-1",
        memberId: "member-1",
        role,
      });
    },
  );

  it("scopes the membership query to both the active organization and user", async () => {
    await guard.canActivate(context);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0].text).toContain(
      'where ("member"."organizationId" = $1 and "member"."userId" = $2)',
    );
    expect(query.mock.calls[0]?.[1]).toEqual(["organization-1", "user-1", 1]);
  });

  it("rejects a user without current membership", async () => {
    query.mockResolvedValue({ rows: [] });

    const result = guard.canActivate(context);

    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(result).rejects.toMatchObject({
      status: 403,
      response: {
        code: "WORKSPACE_ACCESS_DENIED",
        message: "Access to the selected workspace is denied",
      },
    });
    expect(request.workspace).toBeUndefined();
  });

  it("rechecks membership on the next request even when the session is unchanged", async () => {
    query
      .mockResolvedValueOnce({ rows: [["member-1", "member"]] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    const nextRequest: Partial<WorkspaceRequest> = { auth };
    await expect(guard.canActivate(httpContext(nextRequest))).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(nextRequest.workspace).toBeUndefined();
  });

  it("uses the newly selected workspace on a subsequent request", async () => {
    query
      .mockResolvedValueOnce({ rows: [["member-1", "member"]] })
      .mockResolvedValueOnce({ rows: [["member-2", "admin"]] });

    await guard.canActivate(context);

    const nextRequest: Partial<WorkspaceRequest> = {
      auth: {
        ...auth,
        session: { ...auth.session, activeOrganizationId: "organization-2" },
      },
    };
    await expect(guard.canActivate(httpContext(nextRequest))).resolves.toBe(true);

    expect(query.mock.calls[1]?.[1]).toEqual(["organization-2", "user-1", 1]);
    expect(nextRequest.workspace).toEqual({
      userId: "user-1",
      organizationId: "organization-2",
      memberId: "member-2",
      role: "admin",
    });
  });

  it("ignores organization and user IDs supplied by the client", async () => {
    const suppliedIds = {
      organizationId: "another-organization",
      userId: "another-user",
    };
    request.body = suppliedIds;
    request.query = suppliedIds;
    request.params = suppliedIds;
    request.headers = {
      "x-organization-id": suppliedIds.organizationId,
      "x-user-id": suppliedIds.userId,
    };

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(query.mock.calls[0]?.[1]).toEqual(["organization-1", "user-1", 1]);
    expect(request.workspace).toMatchObject({
      userId: "user-1",
      organizationId: "organization-1",
    });
  });

  it("propagates database failures without granting access or returning an auth error", async () => {
    const error = new Error("Database unavailable");
    query.mockRejectedValue(error);

    const result = guard.canActivate(context);

    await expect(result).rejects.toBeInstanceOf(DrizzleQueryError);
    await expect(result).rejects.toMatchObject({ cause: error });
    expect(request.workspace).toBeUndefined();
  });
});
