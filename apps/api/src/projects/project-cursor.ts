import { Buffer, isUtf8 } from "node:buffer";
import { BadRequestException } from "@nestjs/common";
import { ListProjectsQuery, Project } from "@sereneset/contracts";
import { z } from "zod";

const CursorToken = ListProjectsQuery.shape.cursor.unwrap();
const CursorPayload = z.strictObject({
  version: z.literal(1),
  organizationId: Project.shape.organizationId,
  // PostgreSQL timestamp input has no year zero.
  createdAt: Project.shape.createdAt.refine(
    (value) => !value.startsWith("0000-"),
  ),
  id: Project.shape.id,
});

export type ProjectCursor = Readonly<{
  createdAt: Date;
  id: string;
}>;

export function encodeProjectCursor(
  project: ProjectCursor & Readonly<{ organizationId: string }>,
): string {
  const payload = CursorPayload.parse({
    version: 1,
    organizationId: project.organizationId,
    createdAt: project.createdAt.toISOString(),
    id: project.id,
  });

  return CursorToken.parse(
    Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"),
  );
}

export function decodeProjectCursor(
  token: string,
  organizationId: string,
): ProjectCursor {
  if (!CursorToken.safeParse(token).success) {
    throw invalidCursor();
  }

  const bytes = Buffer.from(token, "base64url");

  if (!isUtf8(bytes) || bytes.toString("base64url") !== token) {
    throw invalidCursor();
  }

  let payload: unknown;

  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw invalidCursor();
  }

  const result = CursorPayload.safeParse(payload);

  if (!result.success || result.data.organizationId !== organizationId) {
    throw invalidCursor();
  }

  return {
    createdAt: new Date(result.data.createdAt),
    id: result.data.id,
  };
}

function invalidCursor(): BadRequestException {
  return new BadRequestException({
    code: "INVALID_PROJECT_CURSOR",
    message: "Invalid project cursor",
  });
}
