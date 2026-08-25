"use client";

import { useActionState } from "react";
import { createJob } from "@/app/actions/portal-admin";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function CreateJobForm({
  clients,
}: {
  clients: { id: number; name: string; company: string | null }[];
}) {
  const [state, action, pending] = useActionState(createJob, initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">New Inspection Job</CardTitle>
        <CardDescription>
          Creates a tracked job visible in the client&apos;s portal. A reference
          number is generated automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="j-client">Client</Label>
            <ClientSelect clients={clients} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="j-service">Service</Label>
            <Input id="j-service" name="service" required placeholder="Stock Monitoring" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="j-location">Location</Label>
            <Input id="j-location" name="location" placeholder="Tema, Tank Farm B" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="j-cargo">Cargo / product</Label>
            <Input id="j-cargo" name="cargoType" placeholder="AGO, PMS, Jet A-1…" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="j-notes">Scope notes</Label>
            <Textarea id="j-notes" name="notes" rows={3} placeholder="What the job covers…" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending} className="btn-gold">
              {pending ? "Creating…" : "Create Job"}
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

function ClientSelect({
  clients,
}: {
  clients: { id: number; name: string; company: string | null }[];
}) {
  return (
    <Select name="clientId" required defaultValue={clients[0] ? String(clients[0].id) : undefined}>
      <SelectTrigger id="j-client" className="w-full">
        <SelectValue placeholder={clients.length === 0 ? "Create a client first" : "Select client"} />
      </SelectTrigger>
      <SelectContent>
        {clients.map((c) => (
          <SelectItem key={c.id} value={String(c.id)}>
            {c.name}
            {c.company ? ` — ${c.company}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
