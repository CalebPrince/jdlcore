"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RealtimeClientConfig = { url: string; anonKey: string };

let clientPromise: Promise<SupabaseClient> | null = null;
let clientKey = "";

/** One shared connection per page, loaded only when a page actually listens. */
function getClient(config: RealtimeClientConfig): Promise<SupabaseClient> {
  const key = `${config.url}|${config.anonKey}`;
  if (!clientPromise || clientKey !== key) {
    clientKey = key;
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    );
  }
  return clientPromise;
}

/**
 * Listens for the server's "something new" ring on a channel. `onRing` carries no data: the caller
 * fetches what changed through the app's own signed-in API. `onStatus` reports whether the live
 * connection is up, so the caller can fall back to polling while it isn't. Returns a stop function.
 */
export function listenForRing(
  config: RealtimeClientConfig,
  topic: string,
  onRing: () => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  let stopped = false;
  let stop = () => {};

  void getClient(config)
    .then((client) => {
      if (stopped) return;
      const channel = client
        .channel(topic)
        .on("broadcast", { event: "new" }, () => onRing())
        .subscribe((status) => onStatus?.(status === "SUBSCRIBED"));
      stop = () => void client.removeChannel(channel);
    })
    .catch(() => onStatus?.(false));

  return () => {
    stopped = true;
    stop();
  };
}
