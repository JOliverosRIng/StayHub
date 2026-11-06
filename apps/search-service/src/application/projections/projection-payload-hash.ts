import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left === right ? 0 : 1))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

export function projectionPayloadHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(payload)))
    .digest("hex");
}
