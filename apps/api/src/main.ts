import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.js";

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);

const config = app.get<ConfigService<Env>>(ConfigService);

app.enableShutdownHooks();

await app.listen(
  config.getOrThrow("PORT", { infer: true }),
  "0.0.0.0",
);
