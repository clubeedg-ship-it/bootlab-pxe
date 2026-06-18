"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SetupScript } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Plus, Terminal, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Lang = "powershell" | "batch";

interface Draft {
  id: number | null;
  name: string;
  description: string;
  language: Lang;
  content: string;
  run_order: number;
  enabled: boolean;
}

const EMPTY: Draft = {
  id: null,
  name: "",
  description: "",
  language: "powershell",
  content: "",
  run_order: 100,
  enabled: true,
};

function toDraft(s: SetupScript): Draft {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? "",
    language: s.language,
    content: s.content,
    run_order: s.run_order,
    enabled: s.enabled,
  };
}

export default function SetupScriptsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["setup-scripts"],
    queryFn: api.setupScripts,
    refetchInterval: 5000,
  });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["setup-scripts"] });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        name: d.name.trim(),
        description: d.description.trim() || null,
        language: d.language,
        content: d.content,
        run_order: d.run_order,
        enabled: d.enabled,
      };
      return d.id === null
        ? api.createSetupScript(body)
        : api.updateSetupScript(d.id, body);
    },
    onSuccess: () => {
      toast.success(draft.id === null ? "Script created" : "Script saved");
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: (s: SetupScript) => api.updateSetupScript(s.id, { enabled: !s.enabled }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (s: SetupScript) => api.deleteSetupScript(s.id),
    onSuccess: () => {
      toast.success("Script deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setDraft(EMPTY); setOpen(true); };
  const openEdit = (s: SetupScript) => { setDraft(toDraft(s)); setOpen(true); };

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Setup Scripts</h1>
          <p className="text-sm text-zinc-400">
            Post-boot scripts that run automatically on a machine&apos;s first boot after
            FOG imaging — GPU drivers and any other setup. Edits apply to the next deploy,
            no re-imaging needed.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> New script
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4 text-zinc-400" />
            Scripts ({data?.length ?? 0}) — run in order
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-zinc-500">
                    No setup scripts yet — add one to run on first boot.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs text-zinc-400">{s.run_order}</TableCell>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    {s.description && <div className="text-xs text-zinc-500">{s.description}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{s.language === "batch" ? "Batch" : "PowerShell"}</Badge>
                  </TableCell>
                  <TableCell>
                    <button onClick={() => toggleEnabled.mutate(s)} className="cursor-pointer">
                      <Badge
                        variant="outline"
                        className={s.enabled
                          ? "border-emerald-700/50 text-emerald-400"
                          : "border-zinc-700 text-zinc-500"}
                      >
                        {s.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete setup script "${s.name}"?`)) remove.mutate(s);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft.id === null ? "New setup script" : `Edit ${draft.name}`}</DialogTitle>
            <DialogDescription>
              Runs as SYSTEM on first boot. Use <code className="text-zinc-300">$PXE_BASE</code> to
              reach the bootlab server (e.g. <code className="text-zinc-300">$PXE_BASE/drivers/…</code>)
              and <code className="text-zinc-300">Write-Log</code> to log to C:\PXE\firstboot.log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={draft.name}
                  placeholder="20-my-setup"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order">Run order</Label>
                <Input
                  id="order"
                  type="number"
                  value={draft.run_order}
                  onChange={(e) => setDraft({ ...draft, run_order: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">Description</Label>
              <Input
                id="desc"
                value={draft.description}
                placeholder="What this script does"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 items-end gap-4">
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Select
                  value={draft.language}
                  onValueChange={(v) => setDraft({ ...draft, language: v as Lang })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="powershell">PowerShell</SelectItem>
                    <SelectItem value="batch">Batch (.cmd)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-500"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />
                Enabled (runs on deploy)
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content">Script</Label>
              <Textarea
                id="content"
                className="font-mono text-xs"
                rows={16}
                value={draft.content}
                placeholder={draft.language === "batch"
                  ? "@echo off\r\nREM runs via cmd /c"
                  : "# PowerShell — $PXE_BASE, $WorkDir and Write-Log are available"}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => save.mutate(draft)}
              disabled={!draft.name.trim() || save.isPending}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
