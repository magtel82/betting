"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { inviteUser, removeFromWhitelist } from "../actions";
import type { InviteWhitelist } from "@/types";

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
    >
      {pending ? "Lägger till…" : "Bjud in"}
    </button>
  );
}

function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs text-red-500 hover:text-[var(--loss)] disabled:opacity-50"
    >
      {pending ? "…" : "Ta bort"}
    </button>
  );
}

function WhitelistEntry({ entry }: { entry: InviteWhitelist }) {
  const [, action] = useActionState(removeFromWhitelist, null);
  return (
    <li className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm text-gray-800">{entry.email}</p>
        <p className="text-xs text-gray-400">
          {entry.used_at ? "Använd" : "Ej använd"}
        </p>
      </div>
      <form action={action}>
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="email" value={entry.email} />
        <RemoveButton />
      </form>
    </li>
  );
}

interface Props {
  whitelist: InviteWhitelist[];
}

export function InviteForm({ whitelist }: Props) {
  const [state, action] = useActionState(inviteUser, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) formRef.current?.reset();
  }, [state]);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Bjud in via Google</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <form ref={formRef} action={action} className="flex gap-2">
          <input
            name="email"
            type="email"
            placeholder="epost@example.com"
            required
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
          />
          <AddButton />
        </form>

        {state && "error" in state && (
          <p className="text-sm text-[var(--loss)]">{state.error}</p>
        )}
        {state && "success" in state && (
          <p className="text-sm text-[var(--win)]">{state.success}</p>
        )}

        {whitelist.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {whitelist.map((entry) => (
              <WhitelistEntry key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {whitelist.length === 0 && (
          <p className="text-sm text-gray-400">Inga inbjudningar ännu.</p>
        )}
      </div>
    </section>
  );
}
