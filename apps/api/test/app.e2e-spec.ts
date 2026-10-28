import { setupTestApp } from "./helpers/test-app.js";

describe("App (e2e)", () => {
  const getApp = setupTestApp();

  it("/ (GET)", async () => {
    const app = getApp();

    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    expect(response.payload).toBe("Hello World!");
  });

  it("allows credentialed requests from the web origin", async () => {
    const app = getApp();

    const origin = "http://localhost:3000";

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/sign-in/email",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");

    const methods = String(response.headers["access-control-allow-methods"])
      .split(",")
      .map((value) => value.trim());

    const headers = String(response.headers["access-control-allow-headers"])
      .toLowerCase()
      .split(",")
      .map((value) => value.trim());

    expect(methods).toContain("POST");
    expect(headers).toContain("content-type");
  });
});
