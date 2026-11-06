import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
  ) {}
}
