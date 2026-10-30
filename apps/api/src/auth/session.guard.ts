import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { isAPIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Auth } from "./auth.js";
import { AUTH } from "./auth.tokens.js";
import { kAPIErrorHeaderSymbol } from "better-call";

export type AuthSession = Auth["$Infer"]["Session"];

export type SessionRequest = FastifyRequest & {
  auth?: AuthSession;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<SessionRequest>();
    const reply = http.getResponse<FastifyReply>();

    reply.header("Cache-Control", "private, no-store");

    try {
      const { response, headers } = await this.auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
        query: { disableCookieCache: true },
        returnHeaders: true,
      });

      const cookies = headers.getSetCookie();
      if (cookies.length > 0) {
        reply.header("set-cookie", cookies);
      }

      if (!response) {
        throw new UnauthorizedException({
          code: "UNAUTHENTICATED",
          message: "Authentication required",
        });
      }

      request.auth = response;
      return true;
    } catch (error) {
      if (isAPIError(error)) {
        const accumulated: unknown = Reflect.get(
          error,
          kAPIErrorHeaderSymbol,
        );

        const headers =
          accumulated instanceof Headers
            ? accumulated
            : new Headers(error.headers);

        const cookies = headers.getSetCookie();
        if (cookies.length > 0) {
          reply.header("set-cookie", cookies);
        }

        if (error.statusCode === 401) {
          throw new UnauthorizedException({
            code: "UNAUTHENTICATED",
            message: "Authentication required",
          });
        }
      }

      throw error;
    }
  }
}
