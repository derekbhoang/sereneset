import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { DatabaseModule } from "../database/database.module.js";
import { DatabaseService } from "../database/database.service.js";
import * as schema from "../database/schema/auth.js";
import { createAuth } from "./auth.js";
import { AUTH } from "./auth.tokens.js";
import { SessionGuard } from "./session.guard.js";

@Module({
  imports: [DatabaseModule],
  providers: [
    SessionGuard,
    {
      provide: AUTH,
      inject: [DatabaseService, ConfigService],
      useFactory: (
        database: DatabaseService,
        config: ConfigService<Env>,
      ) =>
        createAuth(database.db, schema, {
          secret: config.getOrThrow("BETTER_AUTH_SECRET", {
            infer: true,
          }),
          baseURL: config.getOrThrow("BETTER_AUTH_URL", {
            infer: true,
          }),
          webOrigin: config.getOrThrow("WEB_ORIGIN", {
            infer: true,
          }),
        }),
    },
  ],
  exports: [AUTH, SessionGuard],
})
export class AuthModule {}
