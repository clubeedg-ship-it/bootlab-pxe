"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, friendlyName, componentSummary } from "@/lib/api";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default function MachinesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["machines"],
    queryFn: api.machines,
    refetchInterval: 5000,
  });

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Machines</h1>
        <p className="text-sm text-zinc-400">Every MAC the PXE server has ever seen.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fleet inventory ({data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identity</TableHead>
                <TableHead>MAC</TableHead>
                <TableHead>Asset tag</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Last IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-zinc-500">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-zinc-500">
                    No machines yet. They appear once they PXE boot.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((m) => {
                const name = friendlyName(m);
                const isMac = name === m.mac;
                const comps = componentSummary(m);
                return (
                  <TableRow key={m.mac}>
                    <TableCell>
                      <Link href={`/machines/${encodeURIComponent(m.mac)}`} className="hover:underline">
                        <div className={isMac ? "font-mono text-zinc-400" : "font-medium"}>{name}</div>
                        {comps && <div className="text-xs text-emerald-400/80">{comps}</div>}
                        {!comps && m.hostname && m.product && (
                          <div className="text-xs text-zinc-500">{m.manufacturer} {m.product}</div>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">{m.mac}</TableCell>
                    <TableCell>{m.asset_tag ?? <span className="text-zinc-500">—</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{m.serial ?? <span className="text-zinc-500">—</span>}</TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {formatDistanceToNow(new Date(m.last_seen), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.last_ip ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
