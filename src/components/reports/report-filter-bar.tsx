import { SERVICE_TYPES, SERVICE_TYPE_LABEL } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ReportFilterBar({
  basePath,
  current,
  clients,
  inspectors,
  products,
  depots,
  tanks,
}: {
  basePath: string;
  current: {
    clientId?: string;
    inspectorId?: string;
    serviceType?: string;
    product?: string;
    depot?: string;
    tankId?: string;
    from?: string;
    to?: string;
  };
  clients?: { id: number; name: string; company: string | null }[];
  inspectors?: { id: number; name: string }[];
  products?: string[];
  depots?: string[];
  tanks?: { id: number; name: string }[];
}) {
  return (
    <form
      method="GET"
      action={basePath}
      className="grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-3 lg:grid-cols-6"
      style={{ borderColor: "var(--border)" }}
    >
      {clients && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-client">Client</Label>
          <select
            id="rf-client"
            name="clientId"
            defaultValue={current.clientId ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` — ${c.company}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {inspectors && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-inspector">Inspector</Label>
          <select
            id="rf-inspector"
            name="inspectorId"
            defaultValue={current.inspectorId ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
          >
            <option value="">All inspectors</option>
            {inspectors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rf-service">Service</Label>
        <select
          id="rf-service"
          name="serviceType"
          defaultValue={current.serviceType ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
        >
          <option value="">All services</option>
          {SERVICE_TYPES.map((s) => (
            <option key={s} value={s}>
              {SERVICE_TYPE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {products && products.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-product">Product</Label>
          <select
            id="rf-product"
            name="product"
            defaultValue={current.product ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}
      {depots && depots.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-depot">Depot</Label>
          <select
            id="rf-depot"
            name="depot"
            defaultValue={current.depot ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
          >
            <option value="">All depots</option>
            {depots.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}
      {tanks && tanks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rf-tank">Tank</Label>
          <select
            id="rf-tank"
            name="tankId"
            defaultValue={current.tankId ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
          >
            <option value="">All tanks</option>
            {tanks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rf-from">From</Label>
        <input
          id="rf-from"
          type="date"
          name="from"
          defaultValue={current.from ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rf-to">To</Label>
        <input
          id="rf-to"
          type="date"
          name="to"
          defaultValue={current.to ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
        />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" className="btn-gold">
          Apply
        </Button>
        <Button type="button" variant="ghost" size="sm" asChild>
          <a href={basePath}>Reset</a>
        </Button>
      </div>
    </form>
  );
}
