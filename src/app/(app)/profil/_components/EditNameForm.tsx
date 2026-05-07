"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDisplayNameAction } from "../actions";

interface Props {
  currentName: string;
}

export function EditNameForm({ currentName }: Props) {
  const router = useRouter();
  const [editing, setEditing]   = useState(false);
  const [value, setValue]       = useState(currentName);
  const [error, setError]       = useState<string | null>(null);
  const [isPending, startTrans] = useTransition();

  function startEdit() {
    setValue(currentName);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function save() {
    setError(null);
    startTrans(async () => {
      const result = await updateDisplayNameAction(value);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(result.error ?? "Något gick fel");
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        className="mt-2 text-xs font-medium text-[var(--primary)] hover:underline"
      >
        Ändra namn
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={30}
        autoFocus
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none"
        placeholder="Ditt visningsnamn"
      />
      {error && <p className="text-xs text-[var(--loss)]">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="flex-1 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {isPending ? "Sparar…" : "Spara"}
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}
