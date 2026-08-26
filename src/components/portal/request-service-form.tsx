"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestService } from "@/app/actions/portal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function RequestServiceForm({
  services,
}: {
  services: { key: string; label: string; pricingLabel: string | null }[];
}) {
  const [state, action, pending] = useActionState(requestService, initial);
  const [selectedKey, setSelectedKey] = useState(services[0]?.key ?? "");
  const router = useRouter();
  const selected = services.find((s) => s.key === selectedKey);

  useEffect(() => {
    if (!state.ok) return;
    const timer = setTimeout(() => router.push("/portal"), 1200);
    return () => clearTimeout(timer);
  }, [state.ok, router]);

  return (
    <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="serviceType">Service required</Label>
        <Select name="serviceType" required value={selectedKey} onValueChange={setSelectedKey}>
          <SelectTrigger id="serviceType" className="w-full">
            <SelectValue placeholder="Select a service" />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected?.pricingLabel && (
          <p className="m-0 text-xs text-gold-700">{selected.pricingLabel}</p>
        )}
        <input type="hidden" name="service" value={selected?.label ?? ""} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" placeholder="Tema, Tank Farm B" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product">Product</Label>
        <Input id="product" name="product" placeholder="AGO, PMS, Jet A-1…" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tankOrDepot">Tank / Depot</Label>
        <Input id="tankOrDepot" name="tankOrDepot" placeholder="Tank 4" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="requestedDate">Requested date</Label>
        <Input id="requestedDate" name="requestedDate" type="date" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="clientRef">Your reference (optional)</Label>
        <Input id="clientRef" name="clientRef" placeholder="PO number or internal reference" />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="notes">Additional instructions / comments</Label>
        <Textarea id="notes" name="notes" rows={3} />
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} className="btn-gold">
          {pending ? "Submitting…" : "Submit Request"}
        </Button>
      </div>

      {state.message && !state.ok && (
        <div className="sm:col-span-2">
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        </div>
      )}
      {state.ok && (
        <div className="sm:col-span-2">
          <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
            <AlertDescription className="text-[#1f7a4d]">{state.message}</AlertDescription>
          </Alert>
        </div>
      )}
    </form>
  );
}
