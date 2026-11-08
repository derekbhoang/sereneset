import { Buffer } from "node:buffer";
import { BadRequestException } from "@nestjs/common";
import { ListProjectsQuery } from "@sereneset/contracts";
import { ZodError } from "zod";
import {
  decodeProjectCursor,
  encodeProjectCursor,
} from "./project-cursor.js";

const organizationId = "workspace-悉尼";
const boundary = {
  organizationId,
  createdAt: new Date("2026-11-09T01:02:03.456Z"),
  id: "3c1a996a-b475-4d33-a87d-e23cb2af606e",
};
const payload = {
  version: 1,
  organizationId,
  createdAt: boundary.createdAt.toISOString(),
  id: boundary.id,
};

function encodePayload(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("Project cursors", () => {
  it("round-trips a query boundary without exposing tenant scope in the result", () => {
    const token = encodeProjectCursor(boundary);

    expect(ListProjectsQuery.parse({ cursor: token }).cursor).toBe(token);
    expect(decodeProjectCursor(token, organizationId)).toEqual({
      createdAt: boundary.createdAt,
      id: boundary.id,
    });
  });

  it("rejects a cursor from a different authorized workspace", () => {
    const token = encodeProjectCursor(boundary);

    expect(() => decodeProjectCursor(token, "another-workspace")).toThrow(
      BadRequestException,
    );
  });

  it.each([
    ["empty", ""],
    ["oversized", "a".repeat(1025)],
    ["invalid base64url", "!invalid!"],
    ["padded base64url", `${encodePayload(payload)}=`],
    ["whitespace", `${encodePayload(payload)}\n`],
    ["invalid UTF-8", Buffer.from([0xff]).toString("base64url")],
    ["invalid JSON", Buffer.from("not JSON", "utf8").toString("base64url")],
  ])("rejects %s tokens with a structured HTTP 400", (_label, token) => {
    expect(() => decodeProjectCursor(token, organizationId)).toThrowError(
      expect.objectContaining({
        status: 400,
        response: {
          code: "INVALID_PROJECT_CURSOR",
          message: "Invalid project cursor",
        },
      }),
    );
  });

  it.each([
    ["an unsupported version", { ...payload, version: 2 }],
    ["an invalid UUID", { ...payload, id: "not-a-uuid" }],
    ["an invalid timestamp", { ...payload, createdAt: "not-a-date" }],
    ["lost millisecond precision", { ...payload, createdAt: "2026-11-09T01:02:03Z" }],
    ["year zero", { ...payload, createdAt: "0000-01-01T00:00:00.000Z" }],
    ["unknown fields", { ...payload, limit: 100 }],
    ["a missing payload", null],
  ])("rejects payloads with %s", (_label, value) => {
    expect(() =>
      decodeProjectCursor(encodePayload(value), organizationId),
    ).toThrow(BadRequestException);
  });

  it("does not emit a cursor beyond the shared token length limit", () => {
    expect(() =>
      encodeProjectCursor({ ...boundary, organizationId: "a".repeat(1024) }),
    ).toThrow(ZodError);
  });
});
