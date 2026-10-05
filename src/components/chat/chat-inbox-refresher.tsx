"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { listenForRing } from "@/lib/realtime-client";

/**
 * Sits on a job list and re-fetches it when the server rings this person's inbox channel (someone
 * posted in one of their job chats), so the unread badges update without a reload. Renders nothing.
 */
export function ChatInboxRefresher({ realtime }: { realtime: { url: string; anonKey: string; topic: string } | null }) {
  const router = useRouter();
  const url = realtime?.url;
  const anonKey = realtime?.anonKey;
  const topic = realtime?.topic;

  useEffect(() => {
    if (!url || !anonKey || !topic) return;
    let timer: ReturnType<typeof setTimeout>;
    const stop = listenForRing({ url, anonKey }, topic, () => {
      // Several messages in quick succession only need one refresh.
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [router, url, anonKey, topic]);

  return null;
}
