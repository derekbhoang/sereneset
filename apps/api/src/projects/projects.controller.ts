import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  CreateProjectInput as CreateProjectInputSchema,
  ListProjectsQuery as ListProjectsQuerySchema,
  ProjectParams as ProjectParamsSchema,
  UpdateProjectInput as UpdateProjectInputSchema,
} from "@sereneset/contracts";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  Project,
  ProjectListResponse,
  ProjectParams,
  UpdateProjectInput,
} from "@sereneset/contracts";
import { CurrentWorkspace } from "../auth/current-workspace.decorator.js";
import { RequireWorkspace } from "../auth/require-workspace.decorator.js";
import type { WorkspaceContext } from "../auth/workspace.guard.js";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe.js";
import { ProjectsService } from "./projects.service.js";

@Controller("api/projects")
@RequireWorkspace()
export class ProjectsController {
  constructor(
    @Inject(ProjectsService)
    private readonly projects: ProjectsService,
  ) {}

  @Post()
  create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(CreateProjectInputSchema))
    input: CreateProjectInput,
  ): Promise<Project> {
    return this.projects.create(workspace, input);
  }

  @Get()
  list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(ListProjectsQuerySchema))
    query: ListProjectsQuery,
  ): Promise<ProjectListResponse> {
    return this.projects.list(workspace, query);
  }

  @Get(":id")
  findOne(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param(new ZodValidationPipe(ProjectParamsSchema))
    params: ProjectParams,
  ): Promise<Project> {
    return this.projects.findOne(workspace, params.id);
  }

  @Patch(":id")
  update(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param(new ZodValidationPipe(ProjectParamsSchema))
    params: ProjectParams,
    @Body(new ZodValidationPipe(UpdateProjectInputSchema))
    input: UpdateProjectInput,
  ): Promise<Project> {
    return this.projects.update(workspace, params.id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param(new ZodValidationPipe(ProjectParamsSchema))
    params: ProjectParams,
  ): Promise<void> {
    await this.projects.remove(workspace, params.id);
  }
}
