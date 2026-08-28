"use client";

import { startTransition, useActionState } from "react";
import { changeStaffRole } from "@/app/actions/staff-admin";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

const ROLE_LABEL: Record<string, string> = {
  operations: "Operations",
  administrator: "Administrator",
  superadmin: "Super Admin",
};

export function RoleSelectInline({ id, role }: { id: number; role: string }) {
  const [state, dispatch, pending] = useActionState(changeStaffRole, initial);

  return (
    <div className="flex flex-col gap-0.5">
      <Select
        defaultValue={role}
        disabled={pending}
        onValueChange={(next) => {
          const formData = new FormData();
          formData.set("id", String(id));
          formData.set("role", next);
          startTransition(() => dispatch(formData));
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-[130px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!state.ok && state.message && (
        <span className="text-[0.65rem] text-red-600">{state.message}</span>
      )}
    </div>
  );
}
