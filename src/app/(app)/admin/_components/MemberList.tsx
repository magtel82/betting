"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { toggleMemberActive } from "../actions";
import type { LeagueMemberWithProfile } from "@/types";

function ToggleButton({ label, danger }: { label: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        danger
          ? "bg-[var(--loss-50)] text-[var(--loss)] hover:opacity-80"
          : "bg-[var(--win-50)] text-[var(--win)] hover:opacity-80"
      }`}
    >
      {pending ? "…" : label}
    </button>
  );
}

function MemberRow({ member, currentUserId }: { member: LeagueMemberWithProfile; currentUserId: string }) {
  const [state, action] = useActionState(toggleMemberActive, null);
  const isSelf = member.user_id === currentUserId;

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {member.profile.display_name}
          {isSelf && <span className="ml-1 text-xs text-gray-400">(du)</span>}
        </p>
        <p className="text-xs text-gray-500">
          {member.role === "admin" ? "Admin" : "Spelare"} ·{" "}
          {member.is_active ? (
            <span className="text-[var(--win)]">Aktiv</span>
          ) : (
            <span className="text-[var(--loss)]">Inaktiv</span>
          )}
        </p>
        {state && "error" in state && (
          <p className="text-xs text-[var(--loss)]">{state.error}</p>
        )}
      </div>
      {!isSelf && (
        <form action={action}>
          <input type="hidden" name="member_id" value={member.id} />
          <input type="hidden" name="user_id" value={member.user_id} />
          <input type="hidden" name="display_name" value={member.profile.display_name} />
          <input
            type="hidden"
            name="new_active"
            value={member.is_active ? "false" : "true"}
          />
          <ToggleButton
            label={member.is_active ? "Inaktivera" : "Aktivera"}
            danger={member.is_active}
          />
        </form>
      )}
    </li>
  );
}

interface Props {
  members: LeagueMemberWithProfile[];
  currentUserId: string;
}

export function MemberList({ members, currentUserId }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">
        Spelare ({members.length})
      </h2>
      <div className="rounded-xl border border-gray-200 bg-white">
        <ul className="divide-y divide-gray-100 px-4">
          {members.length === 0 && (
            <li className="py-4 text-sm text-gray-500">Inga spelare ännu.</li>
          )}
          {members.map((m) => (
            <MemberRow key={m.id} member={m} currentUserId={currentUserId} />
          ))}
        </ul>
      </div>
    </section>
  );
}
