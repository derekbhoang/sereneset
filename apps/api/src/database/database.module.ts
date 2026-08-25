import {
  Inject,
  Module,
  type FactoryProvider,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { EnvironmentVariables } from '../config/env.schema';
import { DATABASE, DATABASE_POOL } from './database.constants';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

const databasePoolProvider: FactoryProvider<Pool> = {
  provide: DATABASE_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService<EnvironmentVariables, true>): Pool => {
    const connectionString = config.getOrThrow('DATABASE_URL', {
      infer: true,
    });

    return new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  },
};

const databaseProvider: FactoryProvider<Database> = {
  provide: DATABASE,
  inject: [DATABASE_POOL],
  useFactory: (pool: Pool): Database =>
    drizzle(pool, {
      schema,
    }),
};

@Module({
  providers: [databasePoolProvider, databaseProvider],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_POOL)
    private readonly pool: Pool,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
