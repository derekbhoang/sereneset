import { z } from "zod";

export const TaskStatus = z.enum(["todo", "in_progress", "done"]);
export type TaskStatus = z.infer<typeof TaskStatus>;
