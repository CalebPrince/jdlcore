"use client";

import { useActionState } from "react";
import { updateInvoiceSettings, type AdminState } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InvoiceSettings } from "@/lib/settings";

const initial: AdminState = { ok: false, message: "" };

export function InvoiceSettingsForm({ defaults }: { defaults: InvoiceSettings }) {
  const [state, action, pending] = useActionState(updateInvoiceSettings, initial);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="font-display">Invoice Settings</CardTitle>
        <CardDescription>
          Controls the numbering, default terms, and footer text used on every invoice —
          both auto-generated on approval and manually issued. Changes apply to new
          invoices only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invoicePrefix">Invoice number prefix</Label>
            <Input id="invoicePrefix" name="invoicePrefix" defaultValue={defaults.invoicePrefix} required />
            <p className="text-xs text-muted-foreground">e.g. INV — produces INV-2026-0001</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="defaultCurrency">Default currency</Label>
            <Select name="defaultCurrency" defaultValue={defaults.defaultCurrency}>
              <SelectTrigger id="defaultCurrency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GHS">GHS</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for auto-generated invoices; pre-fills the manual invoice form too.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="termsDays">Default payment terms (days)</Label>
            <Input
              id="termsDays"
              name="termsDays"
              type="number"
              min={0}
              max={365}
              defaultValue={defaults.termsDays}
              required
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="paymentInstructions">Payment instructions (invoice footer)</Label>
            <Input
              id="paymentInstructions"
              name="paymentInstructions"
              defaultValue={defaults.paymentInstructions}
              maxLength={200}
              required
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="closingNote">Closing note (invoice footer)</Label>
            <Input
              id="closingNote"
              name="closingNote"
              defaultValue={defaults.closingNote}
              maxLength={200}
              required
            />
          </div>

          <div className="sm:col-span-full">
            {state.message && (
              <p
                className={`mb-3 text-sm font-medium ${
                  state.ok ? "text-[#1f7a4d]" : "text-destructive"
                }`}
                role="status"
              >
                {state.message}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save invoice settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
