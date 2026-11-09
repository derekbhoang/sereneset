import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  Project,
  ProjectListResponse,
  UpdateProjectInput,
} from "@sereneset/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { WorkspaceContext } from "../auth/workspace.guard.js";
import { DatabaseService } from "../database/database.service.js";
import { project } from "../database/schema/project.js";
import { decodeProjectCursor, encodeProjectCursor } from "./project-cursor.js";
import { assertProjectPermission } from "./project-permissions.js";

type ProjectRow = typeof project.$inferSelect;

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
  ) {}

  async create(
    workspace: WorkspaceContext,
    input: CreateProjectInput,
  ): Promise<Project> {
    assertProjectPermission(workspace, "create");

    const [created] = await this.database.db
      .insert(project)
      .values({
        organizationId: workspace.organizationId,
        createdByUserId: workspace.userId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();

    if (!created) {
      throw new InternalServerErrorException({
        code: "PROJECT_CREATION_FAILED",
        message: "Project could not be created",
      });
    }

    return toProject(created);
  }

  async list(
    workspace: WorkspaceContext,
    query: ListProjectsQuery,
  ): Promise<ProjectListResponse> {
    assertProjectPermission(workspace, "read");

    const cursor =
      query.cursor === undefined
        ? undefined
        : decodeProjectCursor(query.cursor, workspace.organizationId);

    const rows = await this.database.db
      .select()
      .from(project)
      .where(
        and(
          eq(project.organizationId, workspace.organizationId),
          cursor
            ? sql`(${project.createdAt}, ${project.id}) <
                  (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(
        sql`${project.createdAt} desc nulls last`,
        sql`${project.id} desc nulls last`,
      )
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    return {
      items: page.map(toProject),
      nextCursor:
        rows.length > query.limit && last ? encodeProjectCursor(last) : null,
    };
  }

  async findOne(workspace: WorkspaceContext, id: string): Promise<Project> {
    assertProjectPermission(workspace, "read");

    const [found] = await this.database.db
      .select()
      .from(project)
      .where(
        and(
          eq(project.organizationId, workspace.organizationId),
          eq(project.id, id),
        ),
      )
      .limit(1);

    if (!found) {
      throw projectNotFound();
    }

    return toProject(found);
  }

  async update(
    workspace: WorkspaceContext,
    id: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    assertProjectPermission(workspace, "update");

    const [updated] = await this.database.db
      .update(project)
      .set({
        name: input.name,
        description: input.description,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(project.organizationId, workspace.organizationId),
          eq(project.id, id),
        ),
      )
      .returning();

    if (!updated) {
      throw projectNotFound();
    }

    return toProject(updated);
  }

  async remove(workspace: WorkspaceContext, id: string): Promise<void> {
    assertProjectPermission(workspace, "delete");

    const [deleted] = await this.database.db
      .delete(project)
      .where(
        and(
          eq(project.organizationId, workspace.organizationId),
          eq(project.id, id),
        ),
      )
      .returning({ id: project.id });

    if (!deleted) {
      throw projectNotFound();
    }
  }
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function projectNotFound(): NotFoundException {
  return new NotFoundException({
    code: "PROJECT_NOT_FOUND",
    message: "Project not found",
  });
}
