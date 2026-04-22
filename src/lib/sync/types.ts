// Shared result type returned by every sync function.
// Designed to be serialisable as JSON in route handler responses.
export interface SyncResult {
  processed: number;          // external records examined
  updated:   number;          // rows written/changed in DB
  skipped:   number;          // no change needed or no match found
  errors:    string[];        // non-fatal issues per record
  source:    string;          // which adapter was used
  ranAt:     string;          // ISO UTC timestamp
}

export function emptySyncResult(source: string): SyncResult {
  return { processed: 0, updated: 0, skipped: 0, errors: [], source, ranAt: new Date().toISOString() };
}
