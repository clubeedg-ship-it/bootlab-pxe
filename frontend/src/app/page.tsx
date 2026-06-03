"use client";

import { useQuery } from "@tanstack/react-query";
import { api, friendlyName, type Machine } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveFeed } from "@/components/live-feed";
import { Activity, HardDrive, HardDriveDownload, ListChecks, Monitor, Zap } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

function StatCard({
  icon: Icon, label, value, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-zinc-400">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${accent ?? "text-zinc-500"}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 3000 });
  const sessions = useQuery({
    queryKey: ["sessions", "recent"],
    queryFn: () => api.sessions({ limit: 10 }),
    refetchInterval: 3000,
  });
  const machines = useQuery({ queryKey: ["machines"], queryFn: api.machines, refetchInterval: 5000 });
  const machineByMac = new Map<string, Machine>((machines.data ?? []).map((m) => [m.mac, m]));
  const fogTasks = useQuery({ queryKey: ["fog", "tasks"], queryFn: api.fogActiveTasks, refetchInterval: 3000 });

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-zinc-400">
          Boot platform overview — refreshes every 3 seconds.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <StatCard icon={HardDrive} label="Machines" value={stats.data?.machines_total ?? "—"} />
        <StatCard
          icon={Zap}
          label="Active sessions"
          value={stats.data?.sessions_active ?? "—"}
          accent={stats.data?.sessions_active ? "text-emerald-500" : undefined}
        />
        <StatCard icon={Activity} label="Sessions today" value={stats.data?.sessions_today ?? "—"} />
        <StatCard
          icon={ListChecks}
          label="Pending intents"
          value={stats.data?.intents_pending ?? "—"}
          accent={stats.data?.intents_pending ? "text-amber-500" : undefined}
        />
        <StatCard icon={Monitor} label="Boot profiles" value={stats.data?.profiles_enabled ?? "—"} />
        <StatCard
          icon={HardDriveDownload}
          label="Active deploys"
          value={fogTasks.data?.length ?? "—"}
          accent={fogTasks.data?.length ? "text-emerald-500" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent boot sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead>Client IP</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.data?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-zinc-500">
                        No sessions yet
                      </TableCell>
                    </TableRow>
                  )}
                  {sessions.data?.map((s) => {
                    const m = machineByMac.get(s.mac);
                    const name = m ? friendlyName(m) : s.mac;
                    const isMac = name === s.mac;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs text-zinc-400">
                          {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell>
                          <Link href={`/machines/${encodeURIComponent(s.mac)}`} className="hover:underline">
                            <div className={isMac ? "font-mono text-xs text-zinc-400" : "text-sm font-medium"}>{name}</div>
                            {!isMac && <div className="font-mono text-xs text-zinc-500">{s.mac}</div>}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {s.profile ? (
                            <Badge variant="outline">{s.profile}</Badge>
                          ) : (
                            <span className="text-zinc-500">menu</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{s.client_ip ?? "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={s.ended_at ? "secondary" : "default"}
                            className={!s.ended_at ? "bg-emerald-700" : ""}
                          >
                            {s.ended_at ? "done" : "active"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        <div>
          <LiveFeed />
        </div>
      </div>
    </div>
  );
}
