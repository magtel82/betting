"use client";

import { useActionState, useRef, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { createManualUser } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-600)] disabled:opacity-50"
    >
      {pending ? "Skapar konto…" : "Skapa konto"}
    </button>
  );
}

export function CreateUserForm() {
  const [state, action] = useActionState(createManualUser, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && "success" in state) formRef.current?.reset();
  }, [state]);

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">Skapa manuellt konto</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <form ref={formRef} action={action} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Visningsnamn
            </label>
            <input
              name="display_name"
              type="text"
              placeholder="Spelarnamn"
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              E-postadress (används för inloggning)
            </label>
            <input
              name="email"
              type="email"
              placeholder="epost@example.com"
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Temporärt lösenord (minst 8 tecken)
            </label>
            <input
              name="password"
              type="password"
              placeholder="Minst 8 tecken"
              minLength={8}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
            />
          </div>

          {state && "error" in state && (
            <p className="text-sm text-[var(--loss)]">{state.error}</p>
          )}
          {state && "success" in state && (
            <p className="text-sm text-[var(--win)]">{state.success}</p>
          )}

          <SubmitButton />
        </form>
      </div>
    </section>
  );
}
