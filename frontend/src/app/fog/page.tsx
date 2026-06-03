"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Disc3, Loader2, ServerCrash } from "lucide-react";
import Link from "next/link";

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export default function FogPage() {
  const health = useQuery({ queryKey: ["fog", "health"], queryFn: api.fogHealth, refetchInterval: 10000 });
  const images = useQuery({ queryKey: ["fog", "images"], queryFn: api.fogImages, refetchInterval: 15000 });
  const tasks = useQuery({ queryKey: ["fog", "tasks"], queryFn: api.fogActiveTasks, refetchInterval: 2000 });

  const notConfigured = health.data && !health.data.enabled;
  const unreachable = health.data?.enabled && !health.data.reachable;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Imaging</h1>
        <p className="text-sm text-zinc-400">FOG Project images and live deployments.</p>
      </header>

      {notConfigured && (
        <Card className="border-zinc-700">
          <CardContent className="space-y-1 py-8 text-center text-sm text-zinc-400">
            <ServerCrash className="mx-auto h-6 w-6 text-zinc-500" />
            <div className="font-medium text-zinc-300">FOG is not configured</div>
            <div>
              Set <code className="text-zinc-300">FOG_API_BASE</code>,{" "}
              <code className="text-zinc-300">FOG_API_TOKEN</code> and{" "}
              <code className="text-zinc-300">FOG_USER_TOKEN</code> in the backend env, then restart.
            </div>
          </CardContent>
        </Card>
      )}

      {unreachable && (
        <Card className="border-amber-700/50 bg-amber-950/30">
          <CardContent className="py-4 text-sm text-amber-300">
            FOG is configured but not reachable — check the FOG guest is up at the configured address.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2 className={`h-4 w-4 ${tasks.data?.length ? "animate-spin text-emerald-500" : "text-zinc-500"}`} />
            Active deployments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!tasks.data?.length ? (
            <p className="py-4 text-center text-sm text-zinc-500">No deployments in progress</p>
          ) : (
            <div className="space-y-4">
              {tasks.data.map((t) => (
                <div key={t.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      {t.mac ? (
                        <Link href={`/machines/${encodeURIComponent(t.mac)}`} className="font-mono text-xs hover:underline">
                          {t.host_name ?? t.mac}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">{t.host_name ?? `task ${t.id}`}</span>
                      )}
                      {t.image_name && <Badge variant="outline" className="ml-2">{t.image_name}</Badge>}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {t.percent != null ? `${t.percent.toFixed(0)}%` : "…"}
                      {t.time_remaining ? ` · ${t.time_remaining} left` : ""}
                    </div>
                  </div>
                  <Progress value={t.percent} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Disc3 className="h-4 w-4 text-zinc-400" />
            FOG images
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-right">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!images.data?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-zinc-500">
                    {health.data?.enabled ? "No images captured yet" : "—"}
                  </TableCell>
                </TableRow>
              )}
              {images.data?.map((img) => (
                <TableRow key={img.id}>
                  <TableCell className="font-medium">{img.name}</TableCell>
                  <TableCell className="text-zinc-400">{img.os ?? "—"}</TableCell>
                  <TableCell className="text-zinc-400">{img.format ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{fmtSize(img.size_bytes)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-zinc-500">
            Deploy an image to a specific machine from its detail page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
