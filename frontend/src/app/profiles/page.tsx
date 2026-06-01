"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HardDrive, Monitor, Terminal, Zap } from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  monitor: Monitor,
  terminal: Terminal,
  "hard-drive": HardDrive,
};

export default function ProfilesPage() {
  const { data } = useQuery({ queryKey: ["profiles"], queryFn: api.profiles });

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Boot Profiles</h1>
        <p className="text-sm text-zinc-400">
          Boot images the PXE server can hand out. Defined in the database
          and rendered into iPXE scripts on demand.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.map((p) => {
          const Icon = ICON_MAP[p.icon ?? ""] ?? Zap;
          return (
            <Card key={p.name}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <div className="rounded-md bg-zinc-800 p-2">
                  <Icon className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{p.display_name}</CardTitle>
                  <p className="font-mono text-xs text-zinc-500">{p.name}</p>
                </div>
                <Badge variant={p.enabled ? "default" : "secondary"}>
                  {p.enabled ? "enabled" : "disabled"}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-400">{p.description}</p>
                <div className="mt-3">
                  <Badge variant="outline" className="text-xs">
                    {p.category}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
