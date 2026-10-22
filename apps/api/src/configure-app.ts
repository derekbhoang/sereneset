import { ConfigService } from "@nestjs/config";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { registerAuthRoutes } from "./auth/auth.routes.js";
import type { Env } from "./config/env.js";

export function configureApp(app: NestFastifyApplication): void {
  const config = app.get<ConfigService<Env>>(ConfigService);

  app.enableCors({
    origin: config.getOrThrow("WEB_ORIGIN", { infer: true }),
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  registerAuthRoutes(app);
}