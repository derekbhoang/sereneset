import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import type { z } from "zod";

@Injectable()
export class ZodValidationPipe<
  TSchema extends z.ZodType,
> implements PipeTransform<unknown, z.output<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        issues: result.error.issues.map(({ code, path, message }) => ({
          code,
          path,
          message,
        })),
      });
    }

    return result.data;
  }
}
