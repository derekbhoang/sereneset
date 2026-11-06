import { z } from "zod";

const ProjectName = z.string().trim().min(1).max(255);
const Timestamp = z.iso.datetime({ precision: 3 });
const CursorToken = z.string().min(1).max(1024);

export const CreateProjectInput = z.strictObject({
  name: ProjectName,
  description: z.string().nullable().optional(),
});

export const UpdateProjectInput = CreateProjectInput.partial().refine(
  (value) =>
    value.name !== undefined || value.description !== undefined,
  { message: "Provide at least one field to update" },
);

export const ProjectParams = z.strictObject({
  id: z.uuid(),
});

export const ListProjectsQuery = z.strictObject({
  limit: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .default(25),
  cursor: CursorToken.optional(),
});

export const Project = z.object({
  id: z.uuid(),
  organizationId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().nullable(),
  createdByUserId: z.string().min(1),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});

export const ProjectListResponse = z.object({
  items: z.array(Project).max(100),
  nextCursor: CursorToken.nullable(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInput>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;
export type ProjectParams = z.infer<typeof ProjectParams>;
export type ListProjectsQuery = z.infer<typeof ListProjectsQuery>;
export type ListProjectsQueryInput = z.input<typeof ListProjectsQuery>;
export type Project = z.infer<typeof Project>;
export type ProjectListResponse = z.infer<typeof ProjectListResponse>;
