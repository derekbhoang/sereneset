import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import {
  drizzle,
  type NodePgDatabase,
} from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Env } from "../config/env.js";

@Injectable()
export class DatabaseService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;
  private closePromise?: Promise<void>;

  readonly db: NodePgDatabase;

  constructor(
    @Inject(ConfigService)
    config: ConfigService<Env>,
  ) {
    this.pool = new Pool({
      connectionString: config.getOrThrow("DATABASE_URL", {
        infer: true,
      }),
      connectionTimeoutMillis: 5_000,
      query_timeout: 10_000,
      max: 10,
    });

    this.pool.on("error", (error: Error) => {
      this.logger.error(`Idle PostgreSQL connection error: ${error.message}`);
    });

    this.db = drizzle({ client: this.pool });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.db.execute(sql`SELECT 1`);
      this.logger.log("Connected to PostgreSQL");
    } catch (error) {
      await this.onApplicationShutdown();
      throw error;
    }
  }

  onApplicationShutdown(): Promise<void> {
    return (this.closePromise ??= this.pool.end());
  }
}
