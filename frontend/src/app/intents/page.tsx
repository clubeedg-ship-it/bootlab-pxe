"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function IntentsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["intents", "all"],
    queryFn: () => api.intents({ pending_only: true }),
    refetchInterval: 3000,
  });

  const cancel = useMutation({
    mutationFn: (id: number) => api.cancelIntent(id),
    onSuccess: () => {
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: ["intents"] });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Queued Boot Intents</h1>
        <p className="text-sm text-zinc-400">
          Pending boot decisions — applied next time the target MAC PXE boots.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending ({data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>MAC</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Set by</TableHead>
                <TableHead>Set</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-zinc-500">
                    No pending intents
                  </TableCell>
                </TableRow>
              )}
              {data?.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/machines/${encodeURIComponent(i.mac)}`} className="hover:underline">
                      {i.mac}
                    </Link>
                  </TableCell>
                  <TableCell><Badge>{i.profile}</Badge></TableCell>
                  <TableCell className="text-xs">{i.set_by ?? "—"}</TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {formatDistanceToNow(new Date(i.set_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {i.expires_at ? formatDistanceToNow(new Date(i.expires_at), { addSuffix: true }) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{i.notes ?? "—"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => cancel.mutate(i.id)}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
