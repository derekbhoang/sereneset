import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/env.schema';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const config = app.get<ConfigService<EnvironmentVariables, true>>(
    ConfigService,
  );

  const port = config.get('PORT', { infer: true });
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: webOrigin,
    credentials: true,
  });

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
