import { BadRequestException } from "@nestjs/common";
import {
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from "@sereneset/contracts";
import { expectTypeOf } from "vitest";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

describe("ZodValidationPipe", () => {
  it("returns the normalized project body", () => {
    const pipe = new ZodValidationPipe(CreateProjectInput);

    expect(pipe.transform({ name: "  Project  ", description: null })).toEqual({
      name: "Project",
      description: null,
    });
  });

  it("returns transformed and defaulted query values with their output type", () => {
    const pipe = new ZodValidationPipe(ListProjectsQuery);
    const result = pipe.transform({ limit: "10" });

    expectTypeOf(result).toEqualTypeOf<ListProjectsQuery>();
    expect(result).toEqual({ limit: 10 });
    expect(pipe.transform({})).toEqual({ limit: 25 });
  });

  it("rejects client-supplied ownership with an HTTP 400 response", () => {
    const pipe = new ZodValidationPipe(CreateProjectInput);

    expect(() =>
      pipe.transform({ name: "Project", organizationId: "another-workspace" }),
    ).toThrowError(
      expect.objectContaining({
        status: 400,
        response: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          issues: [
            {
              code: "unrecognized_keys",
              path: [],
              message: expect.any(String),
            },
          ],
        },
      }),
    );
  });

  it("rejects an empty project update", () => {
    const pipe = new ZodValidationPipe(UpdateProjectInput);

    expect(() => pipe.transform({})).toThrow(BadRequestException);
  });
});
