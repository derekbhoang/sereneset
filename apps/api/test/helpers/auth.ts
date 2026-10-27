import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { expect } from "vitest";
import { mergeUserCookies } from "./cookies.js";

export type TestUser = {
  userId: string;
  cookie: string;
};

export type TestSessionResponse = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  session: {
    id: string;
    userId: string;
    activeOrganizationId?: string | null;
  };
} | null;

type SignUpOptions = {
  name?: string;
  email?: string;
  password?: string;
};

export async function signUpUser(
  app: NestFastifyApplication,
  {
    name = "Test User",
    email = `test-${randomUUID()}@example.com`,
    password = "Test-password-123!",
  }: SignUpOptions = {},
): Promise<TestUser> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { origin: "http://localhost:3000" },
    payload: { name, email, password },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    user: { id: expect.any(String), name, email },
  });

  const body = response.json<{ user: { id: string } }>();
  const user: TestUser = { userId: body.user.id, cookie: "" };
  mergeUserCookies(user, response.headers["set-cookie"]);
  expect(user.cookie).not.toBe("");

  return user;
}

export async function getSession(
  app: NestFastifyApplication,
  user: Pick<TestUser, "cookie">,
): Promise<TestSessionResponse> {
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/get-session",
    headers: {
      origin: "http://localhost:3000",
      cookie: user.cookie,
    },
  });

  expect(response.statusCode).toBe(200);
  mergeUserCookies(user, response.headers["set-cookie"]);

  return response.json<TestSessionResponse>();
}
