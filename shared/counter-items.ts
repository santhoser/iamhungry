import { z } from "zod";
import { totals, type OrderLine, type Restaurant } from "./domain.js";

export const customItemsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(100),
      price: z.number().int().min(0).max(10000000),
      quantity: z.number().int().min(1).max(50),
    }),
  )
  .max(10);

export const appendItemsSchema = z
  .object({
    version: z.number().int().positive(),
    items: z
      .array(
        z.object({
          id: z.number().int().positive(),
          quantity: z.number().int().min(1).max(50),
        }),
      )
      .max(100)
      .default([]),
    customItems: customItemsSchema.default([]),
  })
  .refine(
    (value) => value.items.length + value.customItems.length > 0,
    "Add at least one item",
  );

export function orderTotals(lines: OrderLine[], restaurant: Restaurant) {
  const legacy = restaurant.gstRate ?? 0;
  return totals(
    lines,
    restaurant.cgstRate ?? legacy / 2,
    restaurant.sgstRate ?? legacy / 2,
    restaurant.gstInclusive,
  );
}
