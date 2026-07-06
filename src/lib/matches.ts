import type { DecidedBy } from "@/types";

// Suffix shown next to a knockout result decided past 90 minutes, so a drawn
// 90-minute scoreline reads correctly next to a settled slip.
const DECIDED_BY_SUFFIX: Record<Exclude<DecidedBy, "regular">, string> = {
  extra_time: "e.f.t.",
  penalties:  "e.str.",
};

export function decidedBySuffix(decidedBy: DecidedBy | null): string {
  if (!decidedBy || decidedBy === "regular") return "";
  return ` (${DECIDED_BY_SUFFIX[decidedBy]})`;
}
