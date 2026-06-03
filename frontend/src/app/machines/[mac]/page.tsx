"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, friendlyName, componentSummary } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Cpu, HardDrive, HardDriveDownload, Loader2, Monitor, Terminal,
  XCircle, Zap, Clock, Tag, Server, MemoryStick,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deploy_windows: Monitor,
  alpine_rescue: Terminal,
  local_boot: HardDrive,
  inventory: Cpu,
};

const PROFILE_STYLES: Record<string, string> = {
  deploy_windows: "bg-blue-600 hover:bg-blue-700 text-white",
  alpine_rescue:  "bg-amber-600 hover:bg-amber-700 text-white",
  local_boot:     "bg-zinc-700 hover:bg-zinc-600 text-white",
  inventory:      "bg-emerald-600 hover:bg-emerald-700 text-white",
};

export default function MachineDetailPage({
  params,
}: {
  params: Promise<{ mac: string }>;
}) {
  const { mac } = use(params);
  const decodedMac = decodeURIComponent(mac);
  const qc = useQueryClient();

  const machine = useQuery({
    queryKey: ["machine", decodedMac],
    queryFn: () => api.machine(decodedMac),
    refetchInterval: 5000,
  });

  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });
  const intents = useQuery({
    queryKey: ["intents", decodedMac],
    queryFn: () => api.intents({ mac: decodedMac, pending_only: false }),
    refetchInterval: 3000,
  });
  const sessions = useQuery({
    queryKey: ["sessions", decodedMac],
    queryFn: () => api.sessions({ mac: decodedMac, limit: 10 }),
    refetchInterval: 3000,
  });

  const fogHealth = useQuery({ queryKey: ["fog", "health"], queryFn: api.fogHealth });
  const fogImages = useQuery({ queryKey: ["fog", "images"], queryFn: api.fogImages });
  const fogTasks = useQuery({
    queryKey: ["fog", "tasks"],
    queryFn: api.fogActiveTasks,
    refetchInterval: 2000,
  });

  const queueIntent = useMutation({
    mutationFn: (profile: string) =>
      api.createIntent({ mac: decodedMac, profile }),
    onSuccess: (_, profile) => {
      const p = profiles.data?.find((pp) => pp.name === profile);
      toast.success(`Queued: ${p?.display_name ?? profile}`, {
        description: "Will boot into this profile on next PXE request.",
      });
      qc.invalidateQueries({ queryKey: ["intents"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const cancelIntent = useMutation({
    mutationFn: (id: number) => api.cancelIntent(id),
    onSuccess: () => {
      toast.success("Intent cancelled");
      qc.invalidateQueries({ queryKey: ["intents"] });
    },
  });

  const [editing, setEditing] = useState(false);
  const [hostname, setHostname] = useState("");
  const [assetTag, setAssetTag] = useState("");
  const [fogImageId, setFogImageId] = useState("");

  const saveMachine = useMutation({
    mutationFn: () =>
      api.updateMachine(decodedMac, {
        hostname: hostname || null,
        asset_tag: assetTag || null,
      }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["machine", decodedMac] });
      qc.invalidateQueries({ queryKey: ["machines"] });
    },
  });

  const fogDeploy = useMutation({
    mutationFn: () => api.fogDeploy({ mac: decodedMac, image_id: Number(fogImageId) }),
    onSuccess: () => {
      toast.success("FOG deploy started", {
        description: "Imaging begins on the next boot of this machine.",
      });
      qc.invalidateQueries({ queryKey: ["fog", "tasks"] });
    },
    onError: (e: Error) => toast.error(`Deploy failed: ${e.message}`),
  });

  const fogCancel = useMutation({
    mutationFn: (id: number) => api.fogCancelTask(id),
    onSuccess: () => {
      toast.success("Deploy cancelled");
      qc.invalidateQueries({ queryKey: ["fog", "tasks"] });
    },
    onError: (e: Error) => toast.error(`Cancel failed: ${e.message}`),
  });

  if (machine.isLoading) return <div className="p-6 text-zinc-500">Loading…</div>;
  if (machine.isError) return <div className="p-6 text-red-400">Machine not found</div>;

  const m = machine.data!;
  const name = friendlyName(m);
  const isMacName = name === m.mac;
  const comps = componentSummary(m);
  const pending = intents.data?.filter((i) => !i.consumed_at) ?? [];
  const activeSession = sessions.data?.find((s) => !s.ended_at);
  const recentSessions = sessions.data?.slice(0, 5) ?? [];
  const fogTaskForMac = fogTasks.data?.find(
    (t) => t.mac && t.mac.toLowerCase() === decodedMac.toLowerCase(),
  );

  const sorted = [...(profiles.data ?? [])].sort((a, b) => {
    const order: Record<string, number> = { deploy: 1, rescue: 2, inventory: 3, fallback: 4 };
    return (order[a.category] ?? 99) - (order[b.category] ?? 99);
  });

  return (
    <div className="p-6 space-y-6">
      {/* ====== HEADER ====== */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className={isMacName ? "text-2xl font-bold font-mono" : "text-2xl font-bold"}>{name}</h1>
            {activeSession ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                booting
              </Badge>
            ) : pending.length > 0 ? (
              <Badge className="bg-amber-600 hover:bg-amber-600">
                <Zap className="mr-1 h-3 w-3" />
                queued
              </Badge>
            ) : (
              <Badge variant="secondary">idle</Badge>
            )}
          </div>
          <p className="font-mono text-xs text-zinc-500">{m.mac}</p>
          {comps && <p className="text-sm text-emerald-400/90 mt-1">{comps}</p>}
          <p className="text-xs text-zinc-500">
            Last seen {formatDistanceToNow(new Date(m.last_seen), { addSuffix: true })}
          </p>
        </div>
        {m.serial && (
          <div className="text-right text-xs">
            <div className="text-zinc-500">Serial</div>
            <div className="font-mono text-sm">{m.serial}</div>
          </div>
        )}
      </header>

      {/* ====== ACTIVE / PENDING BANNER ====== */}
      {pending.length > 0 && (
        <Card className="border-amber-700/50 bg-amber-950/30">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-amber-500" />
              <div>
                <div className="text-sm font-medium">
                  Will boot into{" "}
                  <Badge variant="outline">
                    {profiles.data?.find((p) => p.name === pending[0].profile)?.display_name ?? pending[0].profile}
                  </Badge>{" "}
                  on next PXE request
                </div>
                <div className="text-xs text-zinc-400">
                  Queued by {pending[0].set_by ?? "—"} •{" "}
                  {formatDistanceToNow(new Date(pending[0].set_at), { addSuffix: true })}
                  {pending[0].expires_at && (
                    <> • expires {formatDistanceToNow(new Date(pending[0].expires_at), { addSuffix: true })}</>
                  )}
                </div>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => cancelIntent.mutate(pending[0].id)}>
              <XCircle className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ====== ACTIONS ====== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boot action</CardTitle>
          <p className="text-xs text-zinc-500">
            Pick what this machine should boot into next. Power-cycle it after queueing
            (or wait for it to PXE-boot on its own).
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {sorted.map((p) => {
              const Icon = PROFILE_ICONS[p.name] ?? Cpu;
              const isPending = pending.some((i) => i.profile === p.name);
              return (
                <Button
                  key={p.name}
                  size="lg"
                  className={`${PROFILE_STYLES[p.name] ?? "bg-zinc-700 hover:bg-zinc-600"} h-auto flex-col items-start gap-1 py-4 text-left whitespace-normal`}
                  disabled={queueIntent.isPending || isPending}
                  onClick={() => queueIntent.mutate(p.name)}
                >
                  <div className="flex w-full items-center gap-2">
                    <Icon className="h-5 w-5" />
                    <span className="text-base font-semibold flex-1">{p.display_name}</span>
                    {isPending && <CheckCircle2 className="h-4 w-4" />}
                  </div>
                  {p.description && (
                    <span className="text-xs font-normal opacity-80">{p.description}</span>
                  )}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ====== FOG IMAGE DEPLOY ====== */}
      {fogHealth.data?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HardDriveDownload className="h-4 w-4 text-emerald-500" />
              FOG image deploy
            </CardTitle>
            <p className="text-xs text-zinc-500">
              Image this machine from a FOG golden image. The deploy starts on its next boot and reports progress here.
            </p>
          </CardHeader>
          <CardContent>
            {fogTaskForMac ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    Imaging
                    {fogTaskForMac.image_name && <Badge variant="outline">{fogTaskForMac.image_name}</Badge>}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {fogTaskForMac.percent != null ? `${fogTaskForMac.percent.toFixed(0)}%` : "starting…"}
                    {fogTaskForMac.time_remaining ? ` · ${fogTaskForMac.time_remaining} left` : ""}
                  </div>
                </div>
                <Progress value={fogTaskForMac.percent} />
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {fogTaskForMac.data_copied && fogTaskForMac.data_total
                      ? `${fogTaskForMac.data_copied} / ${fogTaskForMac.data_total}`
                      : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => fogCancel.mutate(fogTaskForMac.id)}
                    disabled={fogCancel.isPending}
                  >
                    <XCircle className="mr-1 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Image</Label>
                  <Select value={fogImageId} onValueChange={setFogImageId}>
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder={fogImages.data?.length ? "Select an image…" : "No images available"} />
                    </SelectTrigger>
                    <SelectContent>
                      {fogImages.data?.map((img) => (
                        <SelectItem key={img.id} value={String(img.id)}>
                          {img.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={!fogImageId || fogDeploy.isPending}
                  onClick={() => fogDeploy.mutate()}
                >
                  {fogDeploy.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <HardDriveDownload className="mr-1 h-4 w-4" />
                  )}
                  Deploy image
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ====== COMPONENTS (from inventory boot) ====== */}
      {(m.cpu_model || m.gpu_model || m.ram_gb || m.storage_total_gb) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="h-4 w-4 text-emerald-500" />
              Components
              {m.inventoried_at && (
                <span className="text-xs font-normal text-zinc-500">
                  inventoried {formatDistanceToNow(new Date(m.inventoried_at), { addSuffix: true })}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {m.cpu_model && (
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Cpu className="h-3.5 w-3.5" /> CPU
                  </div>
                  <div className="mt-1 text-sm font-medium">{m.cpu_model}</div>
                  {(m.cpu_cores || m.cpu_threads) && (
                    <div className="text-xs text-zinc-400">
                      {m.cpu_cores} cores / {m.cpu_threads} threads
                    </div>
                  )}
                </div>
              )}
              {m.gpu_model && (
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <Monitor className="h-3.5 w-3.5" /> GPU
                  </div>
                  <div className="mt-1 text-sm font-medium">{m.gpu_model}</div>
                  {m.gpu_vram_mb && (
                    <div className="text-xs text-zinc-400">
                      {m.gpu_vram_mb >= 1024 ? `${(m.gpu_vram_mb / 1024).toFixed(0)} GB` : `${m.gpu_vram_mb} MB`} VRAM
                    </div>
                  )}
                </div>
              )}
              {m.ram_gb && (
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <MemoryStick className="h-3.5 w-3.5" /> RAM
                  </div>
                  <div className="mt-1 text-sm font-medium">{m.ram_gb} GB</div>
                  {m.ram_modules && m.ram_modules.length > 0 && (
                    <div className="text-xs text-zinc-400">
                      {m.ram_modules.length}× {m.ram_modules[0].type} @ {m.ram_modules[0].speed}
                    </div>
                  )}
                </div>
              )}
              {m.storage_total_gb && (
                <div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <HardDrive className="h-3.5 w-3.5" /> Storage
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {m.storage_total_gb >= 1000
                      ? `${(m.storage_total_gb / 1000).toFixed(1).replace(/\.0$/, "")} TB`
                      : `${m.storage_total_gb} GB`}
                  </div>
                  {m.storage_devices && (
                    <div className="text-xs text-zinc-400">
                      {m.storage_devices.length} device{m.storage_devices.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              )}
            </div>

            {m.storage_devices && m.storage_devices.length > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Storage devices</div>
                  <ul className="space-y-1 text-sm">
                    {m.storage_devices.map((d, i) => (
                      <li key={i} className="flex items-center justify-between font-mono text-xs">
                        <span>
                          {d.model || "Unknown"} {d.vendor && <span className="text-zinc-500">({d.vendor})</span>}
                        </span>
                        <span className="text-zinc-400">{d.size_gb} GB · {d.tran}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ====== TWO-COLUMN: identity + hardware ====== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* IDENTITY */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Identity
            </CardTitle>
            {!editing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setHostname(m.hostname ?? "");
                  setAssetTag(m.asset_tag ?? "");
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Hostname</Label>
                  <Input
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder="e.g. GAMING-PC-01"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Asset tag</Label>
                  <Input
                    value={assetTag}
                    onChange={(e) => setAssetTag(e.target.value)}
                    placeholder="e.g. OMX-2026-001"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={() => saveMachine.mutate()} disabled={saveMachine.isPending}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500">Hostname</dt>
                  <dd>{m.hostname ?? <span className="text-zinc-600">not set</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">Asset tag</dt>
                  <dd>{m.asset_tag ?? <span className="text-zinc-600">not set</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">First seen</dt>
                  <dd className="text-xs text-zinc-400">
                    {formatDistanceToNow(new Date(m.first_seen), { addSuffix: true })}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {/* HARDWARE */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Hardware
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(m.manufacturer || m.product || m.bios_vendor || m.nic_vendor) ? (
              <dl className="space-y-2 text-sm">
                {m.product && (
                  <div>
                    <dt className="text-xs text-zinc-500">Motherboard</dt>
                    <dd>
                      {m.manufacturer && <span className="text-zinc-400">{m.manufacturer} </span>}
                      {m.product}
                    </dd>
                  </div>
                )}
                {m.system_uuid && (
                  <div>
                    <dt className="text-xs text-zinc-500">System UUID</dt>
                    <dd className="font-mono text-xs">{m.system_uuid}</dd>
                  </div>
                )}
                {m.bios_vendor && (
                  <div>
                    <dt className="text-xs text-zinc-500">BIOS</dt>
                    <dd>{m.bios_vendor}</dd>
                  </div>
                )}
                {m.nic_vendor && (
                  <div>
                    <dt className="text-xs text-zinc-500">NIC vendor</dt>
                    <dd>{m.nic_vendor}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="py-4 text-center text-xs text-zinc-500">
                No hardware info yet — will appear after first PXE boot through iPXE.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ====== HISTORY ====== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent boot history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentSessions.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">No boot sessions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Client IP</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs text-zinc-400">
                      {formatDistanceToNow(new Date(s.started_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {s.profile ? (
                        <Badge variant="outline">{s.profile}</Badge>
                      ) : (
                        <span className="text-zinc-500">menu</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {s.intent_id ? `intent #${s.intent_id}` : "menu fallback"}
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
