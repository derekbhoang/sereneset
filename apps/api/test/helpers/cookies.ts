import {
  cookieNameRegex,
  parseCookies,
  parseSetCookieHeader,
} from "better-auth/cookies";

// A cookie store for immediate, same-origin E2E requests. Expiration metadata
// is evaluated on receipt; it is not retained between requests.
export function mergeUserCookies(
  user: { cookie: string },
  setCookie: string | string[] | undefined,
): void {
  if (setCookie === undefined) return;

  const cookies = parseCookies(user.cookie);
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  const now = Date.now();

  for (const header of headers) {
    for (const [name, attributes] of parseSetCookieHeader(header)) {
      if (!cookieNameRegex.test(name)) continue;

      const maxAge = attributes["max-age"];
      const hasMaxAge = maxAge !== undefined && Number.isFinite(maxAge);
      // A valid Max-Age takes precedence over Expires.
      const expired = hasMaxAge
        ? maxAge <= 0
        : attributes.expires !== undefined &&
          attributes.expires.getTime() <= now;

      if (expired) {
        cookies.delete(name);
      } else {
        cookies.set(name, attributes.value);
      }
    }
  }

  user.cookie = Array.from(
    cookies,
    ([name, value]) => `${name}=${encodeURIComponent(value)}`,
  ).join("; ");
}
