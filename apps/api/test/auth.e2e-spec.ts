import { randomUUID } from "node:crypto";
import { getSession, signUpUser } from "./helpers/auth.js";
import { mergeUserCookies } from "./helpers/cookies.js";
import { setupTestApp } from "./helpers/test-app.js";

describe("Authentication (e2e)", () => {
  const getApp = setupTestApp();

  it("creates a session on signup and invalidates it on signout", async () => {
    const app = getApp();

    const email = `auth-${randomUUID()}@example.com`;
    const origin = "http://localhost:3000";

    // 1. Register a user.
    const caller = await signUpUser(app, { email });

    // 2. Save the original cookie for replay after signout.
    const cookie = caller.cookie;

    // 3. Confirm the cookie authenticates the registered user.
    const session = await getSession(app, caller);

    expect(session).toMatchObject({
      user: {
        id: caller.userId,
        email,
        name: "Test User",
      },
      session: {
        id: expect.any(String),
        userId: caller.userId,
      },
    });

    // 4. Sign out.
    const signout = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin, cookie },
      payload: {},
    });

    expect(signout.statusCode).toBe(200);
    expect(signout.json()).toMatchObject({ success: true });
    mergeUserCookies(caller, signout.headers["set-cookie"]);
    expect(caller.cookie).toBe("");

    // 5. Replay the original cookie to verify server-side invalidation.
    const expiredSession = await getSession(app, { cookie });

    expect(expiredSession).toBeNull();
  });

  it("signs in an existing user and creates a working session", async () => {
    const app = getApp();

    const email = `signin-${randomUUID()}@example.com`;
    const password = "Test-password-123!";
    const origin = "http://localhost:3000";

    const caller = await signUpUser(app, {
      name: "Signin User",
      email,
      password,
    });
    const userId = caller.userId;

    const signout = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { origin, cookie: caller.cookie },
      payload: {},
    });

    expect(signout.statusCode).toBe(200);
    mergeUserCookies(caller, signout.headers["set-cookie"]);
    expect(caller.cookie).toBe("");

    // Sign in without carrying the signup cookie.
    const signin = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin },
      payload: { email, password },
    });

    expect(signin.statusCode).toBe(200);
    expect(signin.json()).toMatchObject({
      user: { id: userId, email },
    });

    mergeUserCookies(caller, signin.headers["set-cookie"]);
    expect(caller.cookie).not.toBe("");

    const session = await getSession(app, caller);

    expect(session).toMatchObject({
      user: { id: userId, email },
      session: {
        id: expect.any(String),
        userId,
      },
    });
  });

  it("rejects an incorrect password without authenticating the caller", async () => {
    const app = getApp();

    const email = `wrong-password-${randomUUID()}@example.com`;
    const origin = "http://localhost:3000";

    await signUpUser(app, {
      name: "Password Test User",
      email,
      password: "Correct-password-123!",
    });

    // Do not pass the signup cookies to this request.
    const signin = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin },
      payload: {
        email,
        password: "Incorrect-password-123!",
      },
    });

    expect(signin.statusCode).toBe(401);
    expect(signin.json()).toMatchObject({
      code: "INVALID_EMAIL_OR_PASSWORD",
    });

    // Any cookies returned by the failed attempt must not authenticate.
    const caller = { cookie: "" };
    mergeUserCookies(caller, signin.headers["set-cookie"]);
    const session = await getSession(app, caller);

    expect(session).toBeNull();
  });
});
