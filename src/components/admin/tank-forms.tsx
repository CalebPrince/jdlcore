"use client";

import { useActionState } from "react";
import { createTank } from "@/app/actions/tanks-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function CreateTankForm({
  clients,
}: {
  clients: { id: number; name: string; company: string | null }[];
}) {
  const [state, action, pending] = useActionState(createTank, initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Add Tank</CardTitle>
        <CardDescription>
          Register a client&apos;s tank so inspectors can log stock readings against it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
            <Label htmlFor="tk-client">Client</Label>
            <select
              id="tk-client"
              name="clientId"
              required
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.company ? ` — ${c.company}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-name">Tank name</Label>
            <Input id="tk-name" name="name" required placeholder="Tank 3" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-kind">Type</Label>
            <select
              id="tk-kind"
              name="kind"
              defaultValue="tank"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
            >
              <option value="tank">Storage tank</option>
              <option value="pipeline">Pipeline / line item</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-product">Product</Label>
            <Input id="tk-product" name="product" placeholder="AGO" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-depot">Depot</Label>
            <Input id="tk-depot" name="depot" placeholder="Tema" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-capacity">Capacity (MT)</Label>
            <Input id="tk-capacity" name="capacity" type="number" step="0.001" min="0" placeholder="5000" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-maxheight">Max gauge height (mm)</Label>
            <Input id="tk-maxheight" name="maxGaugeHeightMm" type="number" step="0.001" min="0" placeholder="18000" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tk-minstop">Min pumpable stop (MT)</Label>
            <Input id="tk-minstop" name="minPumpableStop" type="number" step="0.001" min="0" placeholder="200" />
          </div>
          <div className="flex items-center gap-2 sm:col-span-3 lg:col-span-6">
            <input id="tk-roof" name="hasFloatingRoof" type="checkbox" className="size-4 accent-[#c98e12]" />
            <Label htmlFor="tk-roof" className="font-normal">
              Has a floating roof (its calibration table will need a roof-correction column)
            </Label>
          </div>
          <div className="sm:col-span-3 lg:col-span-6">
            <Button type="submit" disabled={pending} className="btn-gold">
              {pending ? "Saving…" : "Add Tank"}
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
  );
}
