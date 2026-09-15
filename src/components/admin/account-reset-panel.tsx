"use client";

import { useActionState, useMemo, useState } from "react";
import { resetAccounts, type ResetAccountsState } from "@/app/actions/account-reset";
import type { AccountType, DirectoryAccount } from "@/lib/account-directory";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TYPE_LABEL: Record<AccountType, string> = {
  portal: "Client",
  staff: "Staff",
  inspector: "Inspector",
  academy: "Academy",
  analytics: "Analytics",
};

const initial: ResetAccountsState = { ok: false, message: "" };

function accountKey(accountType: AccountType, id: number): string {
  return `${accountType}:${id}`;
}

export function AccountResetPanel({
  accounts,
  currentStaffId,
}: {
  accounts: DirectoryAccount[];
  currentStaffId: number;
}) {
  const [state, formAction, pending] = useActionState(resetAccounts, initial);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AccountType | "all">("all");
  const [selected, setSelected] = useState<Map<string, DirectoryAccount>>(new Map());
  const [mode, setMode] = useState<"password" | "link">("password");
  const [emailPassword, setEmailPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (typeFilter !== "all" && a.accountType !== typeFilter) return false;
      if (!term) return true;
      return a.name.toLowerCase().includes(term) || a.email.toLowerCase().includes(term);
    });
  }, [accounts, search, typeFilter]);

  const selectableFiltered = filtered.filter(
    (a) => !(a.accountType === "staff" && a.id === currentStaffId),
  );
  const allFilteredSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((a) => selected.has(accountKey(a.accountType, a.id)));

  function toggle(account: DirectoryAccount) {
    setSelected((prev) => {
      const next = new Map(prev);
      const k = accountKey(account.accountType, account.id);
      if (next.has(k)) next.delete(k);
      else next.set(k, account);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Map(prev);
      if (allFilteredSelected) {
        for (const a of selectableFiltered) next.delete(accountKey(a.accountType, a.id));
      } else {
        for (const a of selectableFiltered) next.set(accountKey(a.accountType, a.id), a);
      }
      return next;
    });
  }

  const targets = Array.from(selected.values()).map((a) => ({
    accountType: a.accountType,
    id: a.id,
  }));
  const confirmMessage =
    mode === "password"
      ? `Set a brand-new password for ${targets.length} account${targets.length === 1 ? "" : "s"}? Their current password stops working immediately.`
      : `Send a password reset link to ${targets.length} account${targets.length === 1 ? "" : "s"}?`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Select accounts</CardTitle>
          <CardDescription>{selected.size} selected</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AccountType | "all")}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className="max-h-[420px] overflow-auto rounded-lg border"
            style={{ borderColor: "var(--border)" }}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      aria-label="Select all filtered accounts"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No accounts match.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((a) => {
                  const isSelf = a.accountType === "staff" && a.id === currentStaffId;
                  const k = accountKey(a.accountType, a.id);
                  return (
                    <TableRow key={k}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(k)}
                          disabled={isSelf}
                          onChange={() => toggle(a)}
                          aria-label={`Select ${a.name}`}
                          title={
                            isSelf
                              ? "You can't reset your own account here — use My Account."
                              : undefined
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABEL[a.accountType]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.statusLabel}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Reset action</CardTitle>
          <CardDescription>Choose what happens to the selected accounts.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={formAction}
            onSubmit={(e) => {
              if (targets.length === 0 || !window.confirm(confirmMessage)) e.preventDefault();
            }}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="targets" value={JSON.stringify(targets)} />
            <input type="hidden" name="mode" value={mode} />

            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="mode-choice"
                  checked={mode === "password"}
                  onChange={() => setMode("password")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-navy-950">Set new password directly</span>
                  <span className="block text-xs text-muted-foreground">
                    Generates a fresh password per account right away. Shown once here so you can
                    relay it yourself — nothing is emailed.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="mode-choice"
                  checked={mode === "link"}
                  onChange={() => setMode("link")}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-navy-950">Send reset link</span>
                  <span className="block text-xs text-muted-foreground">
                    Emails each account a one-time reset link (expires in 1 hour). Their current
                    password still works until they use it.
                  </span>
                </span>
              </label>
            </div>

            {mode === "password" && (
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <input name="emailPassword" type="checkbox" checked={emailPassword} onChange={(event) => setEmailPassword(event.target.checked)} className="mt-0.5" />
                <span><span className="font-medium text-navy-950">Email each generated password</span><span className="block text-xs text-muted-foreground">Optional. The password is still shown once below so it can be copied if delivery fails.</span></span>
              </label>
            )}

            <div>
              <Button type="submit" disabled={pending || targets.length === 0} className="btn-gold">
                {pending
                  ? "Working…"
                  : targets.length > 0
                    ? `Reset ${targets.length} selected`
                    : "Reset selected"}
              </Button>
            </div>
          </form>

          {!state.ok && state.message && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}
          {state.ok && state.message && (
            <Alert className="mt-4 border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
              <AlertDescription className="text-[#1f7a4d]">{state.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {state.ok && state.results && state.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Results</CardTitle>
            <CardDescription>
              {state.mode === "password"
                ? "These passwords are shown only once — copy them now."
                : "Reset links were sent by email where possible; fallback links are shown otherwise."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>{state.mode === "password" ? "New password" : "Link"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.results.map((r) => {
                  const k = accountKey(r.accountType, r.id);
                  const value = r.generatedPassword ?? (r.emailed ? "Emailed" : (r.fallbackLink ?? ""));
                  const copyable = Boolean(r.generatedPassword || r.fallbackLink);
                  return (
                    <TableRow key={k}>
                      <TableCell>
                        <p className="m-0 text-sm font-medium">{r.name}</p>
                        <p className="m-0 text-xs text-muted-foreground">{r.email}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABEL[r.accountType]}</Badge>
                      </TableCell>
                      <TableCell>
                        {copyable ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <code className="rounded bg-muted px-2 py-1 text-xs">{value}</code>
                            {state.mode === "password" && r.emailed ? <Badge variant="outline">Emailed</Badge> : null}
                            <button
                              type="button"
                              className="text-xs font-semibold underline"
                              onClick={() => {
                                navigator.clipboard.writeText(value);
                                setCopiedKey(k);
                                setTimeout(() => setCopiedKey(null), 2000);
                              }}
                            >
                              {copiedKey === k ? "Copied!" : "Copy"}
                            </button>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{value}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
