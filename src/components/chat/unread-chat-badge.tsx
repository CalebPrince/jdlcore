import { MessageSquare } from "lucide-react";

/** "3 new" pill for a job with unread group chat messages. Renders nothing when there are none. */
export function UnreadChatBadge({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-gold-600 px-2.5 py-0.5 text-xs font-bold text-navy-950"
      aria-label={`${count} unread chat message${count === 1 ? "" : "s"}`}
    >
      <MessageSquare className="h-3 w-3" aria-hidden="true" />
      {count > 99 ? "99+" : count} new
    </span>
  );
}
