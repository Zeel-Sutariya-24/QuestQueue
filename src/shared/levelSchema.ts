import { z } from "zod";
import { MAX_LEVEL_W, MIN_LEVEL_W } from "./constants";

const coord = z.number().int().min(0).max(400);
const pt = z.object({ x: coord, y: coord }).strict();
const rect = z
  .object({ x: coord, y: coord, w: z.number().int().min(1).max(400), h: z.number().int().min(1).max(40) })
  .strict();

/** Strict, data-only schema: unknown keys are rejected so no code can ride along. */
export const levelSchema = z
  .object({
    v: z.literal(1),
    width: z.number().int().min(MIN_LEVEL_W).max(MAX_LEVEL_W),
    height: z.number().int().min(12).max(24),
    spawn: pt,
    exit: pt,
    solids: z.array(rect).max(4000),
    spikes: z.array(pt).max(400),
    pits: z.array(pt).max(600),
    hidden: z.array(pt).max(60),
    movers: z
      .array(
        z
          .object({
            x: coord,
            y: coord,
            w: z.number().int().min(1).max(6),
            axis: z.enum(["x", "y"]),
            range: z.number().min(1).max(20),
            speed: z.number().min(0.5).max(3.5),
          })
          .strict(),
      )
      .max(40),
    fallers: z
      .array(z.object({ x: coord, y: coord, w: z.number().int().min(1).max(6) }).strict())
      .max(60),
    fakeDoors: z.array(pt).max(40),
  })
  .strict();
