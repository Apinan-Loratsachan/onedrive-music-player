import { NextRequest } from "next/server";
import { getScanState } from "@/lib/storage";

export const runtime = "nodejs";

function toSSE(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(_request: NextRequest) {
  let lastVersion = 0;
  const encoder = new TextEncoder();
  let pollInterval: NodeJS.Timeout | null = null;
  let keepAliveInterval: NodeJS.Timeout | null = null;
  let isClosed = false;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const cleanup = () => {
        if (pollInterval) clearInterval(pollInterval);
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        pollInterval = null;
        keepAliveInterval = null;
        isClosed = true;
      };

      const safeEnqueue = (payload: string) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Controller is closed; stop timers
          cleanup();
        }
      };

      const send = async () => {
        if (isClosed) return;
        try {
          const scanState = await getScanState();
          const version = scanState?.lastUpdate ?? 0;
          if (version && version !== lastVersion) {
            lastVersion = version;
            safeEnqueue(toSSE({ scanState }));
          }
        } catch {
          // emit error info for debugging, but guard enqueue
          safeEnqueue(toSSE({ error: "failed_to_read_scan_state" }));
        }
      };

      // Send initial markers and state
      safeEnqueue(`: stream-started\n\n`);
      await send();

      // Poll for updates (server-side) and push when changed
      pollInterval = setInterval(send, 1000);

      // Keep-alive comment every 25s to prevent proxies from closing the stream
      keepAliveInterval = setInterval(() => {
        safeEnqueue(`: keep-alive\n\n`);
      }, 25000);

      // Ensure cleanup is called on close
      this.cancel = cleanup;
    },
    cancel() {
      // Fallback cleanup in case above isn't hit
      if (!isClosed) {
        if (pollInterval) clearInterval(pollInterval);
        if (keepAliveInterval) clearInterval(keepAliveInterval);
        pollInterval = null;
        keepAliveInterval = null;
        isClosed = true;
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // CORS if needed
      // "Access-Control-Allow-Origin": "*",
    },
  });
}
