"use client";

import type { AuditLog } from "@/types";

const ACTION_LABELS: Record<string, string> = {
  whitelist_add:            "Inbjudan tillagd",
  whitelist_remove:         "Inbjudan borttagen",
  create_manual_user:       "Manuellt konto skapat",
  member_activate:          "Spelare aktiverad",
  member_deactivate:        "Spelare inaktiverad",
  league_open:              "Liga öppnad",
  league_close:             "Liga stängd",
  tournament_status_change: "Turneringsstatus ändrad",
  match_odds_set:           "Matchodds satta",
  match_result_set:         "Matchresultat uppdaterat",
};

interface Props {
  entries: (AuditLog & { actor: { display_name: string } | null })[];
}

export function AuditLogSection({ entries }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Senaste händelser</h2>
      <div className="rounded-xl border border-gray-200 bg-white">
        {entries.length === 0 ? (
          <p className="px-4 py-4 text-sm text-gray-400">Ingen logg ännu.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    {entry.metadata && (
                      <p className="text-xs text-gray-500 truncate">
                        {Object.values(entry.metadata).join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      {entry.actor?.display_name ?? "System"}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-gray-400">
                    {new Date(entry.created_at).toLocaleString("sv-SE", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
