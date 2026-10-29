
import { ConfigService } from "@nestjs/config";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { fromNodeHeaders } from "better-auth/node";

import type { Env } from "../config/env.js";
import { AUTH } from "./auth.tokens.js";
import type { Auth } from "./auth.js";

export function registerAuthRoutes(
  app: NestFastifyApplication,
): void {
  const auth = app.get<Auth>(AUTH);
  const config = app.get<ConfigService<Env>>(ConfigService);
  const baseURL = config.getOrThrow("BETTER_AUTH_URL", {
    infer: true,
  });

  const fastify = app.getHttpAdapter().getInstance();

  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",

    async handler(request, reply) {
      const headers = fromNodeHeaders(request.headers);

      headers.delete("content-length");

      const body =
        request.method === "POST" && request.body !== undefined
          ? typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body)
          : undefined;

      const authRequest = new Request(
        new URL(request.url, baseURL),
        {
          method: request.method,
          headers,
          body,
        },
      );

      const response = await auth.handler(authRequest);

      reply.code(response.status);

      response.headers.forEach((value, name) => {
        if (
          name !== "set-cookie" &&
          name !== "content-length"
        ) {
          reply.header(name, value);
        }
      });

      const cookies = response.headers.getSetCookie();

      if (cookies.length > 0) {
        reply.header("set-cookie", cookies);
      }

      if (response.body === null) {
        return reply.send();
      }

      return reply.send(
        Buffer.from(await response.arrayBuffer()),
      );
    },
  });
}
