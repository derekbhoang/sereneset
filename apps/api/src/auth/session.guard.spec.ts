import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { APIError } from "better-auth/api";
import { kAPIErrorHeaderSymbol } from "better-call";
import type { FastifyReply } from "fastify";
import { vi } from "vitest";
import type { Auth } from "./auth.js";
import { AUTH } from "./auth.tokens.js";
import {
  SessionGuard,
  type AuthSession,
  type SessionRequest,
} from "./session.guard.js";

type SessionLookup = (
  options: Parameters<Auth["api"]["getSession"]>[0],
) => Promise<{ response: AuthSession | null; headers: Headers }>;

function cookieHeaders(...cookies: string[]): Headers {
  const headers = new Headers();
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
  return headers;
}

describe("SessionGuard", () => {
  const getSession = vi.fn<SessionLookup>();
  const header = vi.fn<FastifyReply["header"]>();

  const cleanupCookies = [
    "better-auth.session_token=; Max-Age=0; Path=/; HttpOnly",
    "better-auth.session_data=; Max-Age=0; Path=/; HttpOnly",
  ] as const;

  let guard: SessionGuard;
  let context: ExecutionContext;
  let request: Pick<SessionRequest, "headers" | "auth">;
  let session: AuthSession;

  beforeEach(async () => {
    getSession.mockReset();
    header.mockReset().mockReturnThis();

    const now = new Date("2026-01-01T00:00:00.000Z");
    session = {
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
        activeOrganizationId: null,
        expiresAt: new Date("2100-01-01T00:00:00.000Z"),
        createdAt: now,
        updatedAt: now,
      },
    };

    getSession.mockResolvedValue({ response: session, headers: new Headers() });

    const module = await Test.createTestingModule({
      providers: [
        SessionGuard,
        { provide: AUTH, useValue: { api: { getSession } } },
      ],
    }).compile();
    guard = module.get(SessionGuard);

    request = {
      headers: {
        cookie: "better-auth.session_token=session-token",
        origin: "http://localhost:3000",
      },
    };
    context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header }),
      }),
    } as unknown as ExecutionContext;
  });

  it("allows an authenticated user without an active workspace", async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.auth).toBe(session);
    expect(header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(header).not.toHaveBeenCalledWith("set-cookie", expect.anything());
  });

  it("checks server-side session storage once using the incoming headers", async () => {
    await guard.canActivate(context);

    expect(getSession).toHaveBeenCalledTimes(1);
    const options = getSession.mock.calls[0]?.[0];
    expect(options?.headers).toBeInstanceOf(Headers);
    expect(options?.headers.get("cookie")).toBe(request.headers.cookie);
    expect(options?.headers.get("origin")).toBe(request.headers.origin);
    expect(options?.query).toEqual({ disableCookieCache: true });
    expect(options?.returnHeaders).toBe(true);
  });

  it("forwards each refresh cookie separately", async () => {
    const cookies = [
      "better-auth.session_token=refreshed; Path=/; HttpOnly",
      "better-auth.session_data=cached; Expires=Fri, 01 Jan 2100 00:00:00 GMT; Path=/",
    ];
    getSession.mockResolvedValue({
      response: session,
      headers: cookieHeaders(...cookies),
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(header).toHaveBeenCalledWith("set-cookie", cookies);
  });

  it("rejects a missing session with the application authentication error", async () => {
    getSession.mockResolvedValue({ response: null, headers: new Headers() });

    const result = guard.canActivate(context);

    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(result).rejects.toMatchObject({
      status: 401,
      response: {
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      },
    });
    expect(request.auth).toBeUndefined();
  });

  it("forwards cleanup cookies when the session lookup returns null", async () => {
    getSession.mockResolvedValue({
      response: null,
      headers: cookieHeaders(...cleanupCookies),
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(header).toHaveBeenCalledWith("set-cookie", cleanupCookies);
    expect(request.auth).toBeUndefined();
  });

  it("preserves accumulated cleanup cookies when Better Auth throws a 401", async () => {
    const error = new APIError("UNAUTHORIZED", {
      code: "FAILED_TO_GET_SESSION",
    });
    Object.defineProperty(error, kAPIErrorHeaderSymbol, {
      value: cookieHeaders(...cleanupCookies),
    });
    getSession.mockRejectedValue(error);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
      response: {
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      },
    });

    expect(header).toHaveBeenCalledWith("set-cookie", cleanupCookies);
    expect(request.auth).toBeUndefined();
  });

  it("falls back to explicit error headers when accumulated headers are absent", async () => {
    getSession.mockRejectedValue(
      new APIError("UNAUTHORIZED", undefined, cookieHeaders(...cleanupCookies)),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(header).toHaveBeenCalledWith("set-cookie", cleanupCookies);
  });

  it("uses the merged accumulated headers without duplicating explicit cookies", async () => {
    const error = new APIError(
      "UNAUTHORIZED",
      undefined,
      cookieHeaders(cleanupCookies[0]),
    );
    Object.defineProperty(error, kAPIErrorHeaderSymbol, {
      value: cookieHeaders(...cleanupCookies),
    });
    getSession.mockRejectedValue(error);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(header.mock.calls.filter(([name]) => name === "set-cookie")).toEqual(
      [["set-cookie", cleanupCookies]],
    );
  });

  it("rethrows server API errors after forwarding their cookies", async () => {
    const error = new APIError("INTERNAL_SERVER_ERROR", {
      code: "FAILED_TO_GET_SESSION",
    });
    Object.defineProperty(error, kAPIErrorHeaderSymbol, {
      value: cookieHeaders(...cleanupCookies),
    });
    getSession.mockRejectedValue(error);

    await expect(guard.canActivate(context)).rejects.toBe(error);

    expect(header).toHaveBeenCalledWith("set-cookie", cleanupCookies);
    expect(request.auth).toBeUndefined();
  });

  it("rethrows unexpected errors without authenticating the request", async () => {
    const error = new Error("Session storage is unavailable");
    getSession.mockRejectedValue(error);

    await expect(guard.canActivate(context)).rejects.toBe(error);

    expect(request.auth).toBeUndefined();
    expect(header).not.toHaveBeenCalledWith("set-cookie", expect.anything());
  });
});
