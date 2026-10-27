import { mergeUserCookies } from "./cookies.js";

describe("mergeUserCookies", () => {
  it("preserves cookies when there are no response cookies", () => {
    const user = { cookie: "session=a%2Fb; theme=dark" };

    mergeUserCookies(user, undefined);

    expect(user.cookie).toBe("session=a%2Fb; theme=dark");
  });

  it("merges combined headers without splitting an Expires date", () => {
    const user = { cookie: "session=old; theme=dark" };

    mergeUserCookies(
      user,
      "session=new; Path=/; HttpOnly, preference=light; Expires=Fri, 01 Jan 2100 00:00:00 GMT",
    );

    expect(user.cookie).toBe("session=new; theme=dark; preference=light");
  });

  it("round-trips encoded values without double encoding or losing equals signs", () => {
    const user = { cookie: "session=a%2Fb%25%3D" };

    mergeUserCookies(user, "token=x=y==; Path=/");

    expect(user.cookie).toBe("session=a%2Fb%25%3D; token=x%3Dy%3D%3D");
  });

  it("removes deleted cookie chunks and preserves valid empty values", () => {
    const user = {
      cookie:
        "__Secure-better-auth.session_data.0=old; __Secure-better-auth.session_data.1=stale",
    };

    mergeUserCookies(user, [
      "__Secure-better-auth.session_data.0=new; Secure",
      "__Secure-better-auth.session_data.1=stale; Max-Age=0",
      "preference=; Path=/",
    ]);

    expect(user.cookie).toBe(
      "__Secure-better-auth.session_data.0=new; preference=",
    );
  });

  it.each([
    ["Max-Age=-1", ""],
    ["Expires=Thu, 01 Jan 1970 00:00:00 GMT", ""],
    ["Max-Age=60; Expires=Thu, 01 Jan 1970 00:00:00 GMT", "session=new"],
    ["Max-Age=0; Expires=Fri, 01 Jan 2100 00:00:00 GMT", ""],
    ["Max-Age=invalid; Expires=Thu, 01 Jan 1970 00:00:00 GMT", ""],
  ])("handles expiry attributes: %s", (attributes, expected) => {
    const user = { cookie: "session=old" };

    mergeUserCookies(user, `session=new; ${attributes}`);

    expect(user.cookie).toBe(expected);
  });

  it("applies repeated updates in response order", () => {
    const user = { cookie: "session=old" };

    mergeUserCookies(user, ["session=; Max-Age=0", "session=new"]);

    expect(user.cookie).toBe("session=new");
  });
});
