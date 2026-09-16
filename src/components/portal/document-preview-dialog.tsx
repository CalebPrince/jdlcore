"use client";

import { Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function DocumentPreviewDialog({
  href,
  title,
  triggerClassName = "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.82rem] font-semibold text-navy-800 transition-colors hover:bg-navy-50",
}: {
  href: string;
  title: string;
  triggerClassName?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName} style={{ borderColor: "var(--border)" }}>
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{title}</DialogTitle>
        </DialogHeader>
        <iframe
          src={href}
          title={title}
          className="min-h-[70vh] w-full flex-1 rounded-b-[var(--radius)] border-t"
          style={{ borderColor: "var(--border)" }}
        />
      </DialogContent>
    </Dialog>
  );
}
