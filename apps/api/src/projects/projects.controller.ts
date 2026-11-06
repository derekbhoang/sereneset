import { Controller, Inject } from "@nestjs/common";
import { RequireWorkspace } from "../auth/require-workspace.decorator.js";
import { ProjectsService } from "./projects.service.js";

@Controller("api/projects")
@RequireWorkspace()
export class ProjectsController {
  constructor(
    @Inject(ProjectsService)
    private readonly projects: ProjectsService,
  ) {}
}
