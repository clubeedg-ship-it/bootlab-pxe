"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, HardDrive, ListChecks, Monitor, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", icon: Activity },
  { href: "/machines", label: "Machines", icon: HardDrive },
  { href: "/profiles", label: "Boot Profiles", icon: Monitor },
  { href: "/intents", label: "Queued Intents", icon: ListChecks },
];

export function Nav() {
  const path = usePathname();
  return (
    <aside className="flex h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4 text-zinc-100">
        <Shield className="h-5 w-5 text-emerald-500" />
        <span className="font-semibold">Blue Team</span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {links.map((link) => {
          const Icon = link.icon;
          const active = path === link.href || (link.href !== "/" && path.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-800 p-3 text-xs text-zinc-500">
        <div>Omiximo PXE</div>
        <div className="font-mono">192.168.0.222</div>
      </div>
    </aside>
  );
}
