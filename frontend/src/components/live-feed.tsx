"use client";

import { useEffect, useState } from "react";
import { wsUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio } from "lucide-react";

interface Event {
  type: string;
  data: Record<string, unknown>;
  ts: number;
}

export function LiveFeed() {
  const [events, setEvents] = useState<Event[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: NodeJS.Timeout;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        return;
      }
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => setConnected(false);
      ws.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          setEvents((prev) => [{ ...parsed, ts: Date.now() }, ...prev].slice(0, 50));
        } catch {
          // ignore
        }
      };
    };
    connect();
    return () => {
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className={connected ? "h-4 w-4 text-emerald-500" : "h-4 w-4 text-zinc-500"} />
          Live Feed
        </CardTitle>
        <Badge variant={connected ? "default" : "secondary"} className="text-xs">
          {connected ? "connected" : "disconnected"}
        </Badge>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Waiting for boot events…
          </p>
        ) : (
          <ul className="space-y-1 font-mono text-xs">
            {events.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-zinc-500">
                  {new Date(e.ts).toLocaleTimeString()}
                </span>
                <span className="text-emerald-500">{e.type}</span>
                <span className="text-zinc-300 truncate">
                  {JSON.stringify(e.data)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
