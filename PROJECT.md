# bootlab-pxe (iam-os) — master doc

Chunked retrieval. Reach a section via its `## §X` anchor — see `CLAUDE.md §7` for the index, `§G` below for snippets.

Cadence: `§A` PR-gated · `§B` append-only · `§F` append-only · `§C §D §E §G` overwrite freely.

---

## §A — Architecture

### §A.1 Overview
bootlab-pxe ("Omiximo Blue Team Boot") is a single `docker compose up` PXE platform that boots and images PCs on a LAN. Five services: **postgres** (fleet/intent/session state), **redis** (event bus backing), **backend** (FastAPI control plane), **frontend** (Next.js 16 operator panel), **pxe** (host-network container running dnsmasq proxyDHCP + nginx + samba via s6). `iam-os` is the diskless Linux appliance image the platform serves read-write over iSCSI.

**Core value:** a PC with no OS can PXE-boot, be hardware-inventoried, and be deployed (Windows unattended, Alpine rescue, FOG image, or iam-os diskless) — all driven from the panel, with every boot observable live.

### §A.2 Boot flow (the heart)
Client PXE-boots → dnsmasq proxyDHCP chainloads iPXE → iPXE requests `GET /api/v1/boot/<mac>.ipxe` (with SMBIOS query params). The backend: (1) upserts the `Machine` + hardware fingerprint, (2) auto-queues `inventory` on first sighting, (3) looks up a pending one-shot `BootIntent`, (4) opens a `BootSession`, (5) returns either the chosen profile's iPXE script or an interactive menu (default `deploy_windows`, 10s timeout, falls through to `local_boot`). The client POSTs `stage` updates back through install; the panel streams them over WebSocket.

### §A.3 Imaging paths
- **Native Windows deploy:** wimboot → WinPE → dynamic per-machine/per-language `autounattend.xml.j2` + `post-install.ps1.j2` (nl-NL default; locale table in `locales.py`). A baked `SetupComplete.cmd` pulls an assembled first-boot PowerShell doc (concatenated operator `setup_scripts`).
- **FOG Project:** optional external appliance. Capture/deploy via registered-host API tasks (taskTypeID=1) so they show progress in FOG; panel proxies FOG REST through `fog_client` (tokens server-side only). iPXE handoff in `fog/ipxe/default.ipxe`.
- **iam-os diskless:** `iam-os-dev.img` at `/srv/iam-os/` served via tgt iSCSI target `iqn.2026-06.nl.omiximo:iam-os-dev`, read-write, to LAN + KVM test subnet.

### §A.4 Stack
Backend: Python 3.12, FastAPI, SQLAlchemy 2 async + asyncpg, Pydantic-settings (`BT_` prefix), redis, Jinja2, PyJWT, uv. Frontend: Next.js 16 / React 19, TanStack Query, Radix UI, Tailwind v4, pnpm. PXE container: dnsmasq + nginx + samba under s6-overlay. DB: Postgres 16. Migrations: plain numbered `.sql` auto-applied via `docker-entrypoint-initdb.d`.

### §A.5 Access control
`auth.py` → `require_trusted_network`: allow LAN (`BT_LAN_SUBNET`), Tailscale (100.64.0.0/10), localhost. Trusted public hosts (e.g. `boot.abbamarkt.nl`, overridable via `BT_TRUSTED_HOSTS`) require a valid Cloudflare Access JWT when CF Access is configured; warn-mode pass-through otherwise. Backend port bound to 127.0.0.1; pxe container is host-network with NET_ADMIN.

### §A.10 Invariants
Byte-identical mirror of `CLAUDE.md §5`. Changes require a PR updating both files + a `§B` entry.
- `GET /api/v1/boot/{mac}.ipxe` is the heart of the platform — it never 5xx-fails a booting client; worst case it returns a menu or a `local_boot` fall-through.
- A pending one-shot `BootIntent` is consumed exactly once (`consumed_at` set in the same boot transaction).
- First-sighting of a MAC auto-queues the `inventory` profile so the fleet is always fingerprinted.
- FOG API tokens never reach the browser — the backend is the only FOG client (`fog_client`).
- Every state-changing panel call passes `require_trusted_network` (LAN/Tailscale, or Cloudflare Access JWT on a trusted public host).
- dnsmasq runs as the LAN's single proxyDHCP; it never hands out leases, only PXE chainload.
- All backend env config is `BT_`-prefixed; `BT_PXE_SERVER` MUST be set (no safe default).
- The `iam-os` image lives at `/srv/iam-os/`, outside the repo; the repo ships only its tgt target + build script.
- MACs are normalized to lower-colon form at every entry point before any DB touch.

---

## §B — Decisions (append-only)

Each entry: date · id · title, then Decision / Rationale. Only decisions evidenced in code/config are recorded.

### 2026-06 · D-01 · proxyDHCP, not a DHCP server
**Decision:** the pxe container runs dnsmasq in proxyDHCP mode only (no lease pool), host-network. **Rationale:** drop onto an existing LAN without fighting the site router; be the single PXE source without owning addressing.

### 2026-06 · D-02 · Intent/session split with one-shot consumption
**Decision:** operator queues a `BootIntent`; the boot endpoint consumes it once and records a `BootSession` with a JSONB `stages` timeline. **Rationale:** decouple "what should boot next" from "what is booting now"; make every boot replayable and observable.

### 2026-06 · D-03 · Backend is the sole FOG client
**Decision:** the browser only calls `/api/v1/fog/*`; FOG tokens live in backend env and are proxied. **Rationale:** never leak imaging-appliance credentials to the panel; one audited egress point.

### 2026-06 · D-04 · Dynamic per-machine unattend/post-install
**Decision:** `autounattend.xml` and `post-install.ps1` are Jinja-rendered per MAC + language at request time, not static files. **Rationale:** one platform images mixed hardware and locales; hostname/serial baked in per machine.

### 2026-06 · D-05 · iam-os served diskless over iSCSI (read-write)
**Decision:** the iam-os dev appliance is a single `.img` at `/srv/iam-os/`, exported read-write via tgt to LAN + KVM subnets. **Rationale:** fully writable diskless appliance; image kept out of git (size).

> Promote any decision that reaches architectural weight into this log; cross-reference code comments where present (e.g. routes_fog header, auth.py docstring).

---

## §C — Roadmap & open questions

### §C.1 Roadmap (inferred from commits + state)
| Phase | Content | Status |
|---|---|---|
| P1 | Compose platform: PG/Redis/FastAPI/Next/pxe; boot dispatch + panel | done (`7868fed`) |
| P2 | FOG Project imaging integration (iPXE handoff + capture/deploy) | done (`9681bb0`) |
| P3 | FOG management UI + backend proxy | done (`977b900`) |
| P4 | iam-os diskless appliance: build script + iSCSI target | image built; **not yet a boot profile** |
| P5 | Wire in-flight FOG/post-install WIP + commit | **in progress (uncommitted)** |
| P6 | Operational hardening (Tailscale verify, CF Access enforce, audit coverage) | partial |

### §C.2 Open questions
- OQ-1 — Add an `iam-os` `BootProfile` (sanboot/iSCSI iPXE) so the panel can target it like other profiles? Currently iSCSI target exists but no profile row.
- OQ-2 — `require_tailscale` flag is False ("set True once verified") — when to enforce?
- OQ-3 — Cloudflare Access is warn-mode unless `BT_CF_ACCESS_*` set; decide enforce policy before any public exposure.
- OQ-4 — No migration system beyond raw initdb `.sql`; revisit if schema churns post-launch.
- OQ-5 — `docs/` is empty; decide whether operator runbook lives there or in PROJECT.md.

---

## §D — Workstreams (lane memory)

One lane per packet. Read only the lane you're in.

### §D.1 backend lane
**Roots:** `backend/app/` — `routes_boot.py` (iPXE dispatch, dynamic unattend/post-install), `routes_stage.py`, `routes_fog.py` + `fog_client.py`, `routes_api.py`, `db.py` (SQLAlchemy models), `schemas.py`, `auth.py`, `config.py` (`BT_` settings), `events.py` (redis bus), `oui.py`, `locales.py`, `templates/*.j2`.
**Contract:** MAC-normalize at every entry; boot endpoint must never 5xx a client; FOG only via `fog_client`; gate mutations with `require_trusted_network`.

### §D.2 frontend lane
**Roots:** `frontend/src/app/` (pages: dashboard, machines, machines/[mac], profiles, intents, fog), `frontend/src/components/` (live-feed WS, nav, ui/* Radix), `frontend/src/lib/api.ts`. Next.js 16 / React 19 / TanStack Query / Tailwind v4.
**Contract:** browser never holds FOG tokens; call backend `/api/v1/*` only; live updates over the WS event bus.

### §D.3 pxe lane
**Roots:** `pxe/` — `Dockerfile`, `entrypoint.sh`, `s6/` (dnsmasq/nginx/samba services), `templates/*.template` (dnsmasq.conf, nginx.conf, smb.conf, boot.ipxe, startnet.cmd), `scripts/setup-iso.sh`. Host-network, NET_ADMIN.
**Contract:** proxyDHCP only (no lease pool); serve assets over nginx :8085; keep dnsmasq the single LAN PXE source.

### §D.4 image lane (iam-os)
**Roots:** `scripts/build-iam-os-dev-image.sh`, `scripts/flash-usb.sh`, `etc/iam-os/tgt-iam-os.conf`. Image artifacts at `/srv/iam-os/` (out of repo).
**Contract:** image stays out of git; repo ships build script + tgt target; iSCSI export is read-write to LAN + KVM subnets only.

---

## §E — Handoff (current next-step)

> Overwrite per session. As of 2026-06-12.

**Current mode:** platform is built and functional through FOG management UI (3 clean commits). A fresh `iam-os` dev image (2.6 GB) was just built into `/srv/iam-os/` and its iSCSI tgt target added under `etc/iam-os/`. The working tree has ~10 uncommitted modifications (backend db/routes/schemas, post-install template, FOG iPXE, frontend nav/api) plus a staged deletion of `fog/scripts/post-deploy.ps1`.

**Recommended next actions (priority):**
1. Review and commit the in-flight WIP as a coherent unit (inspect `git diff` per file; the post-deploy.ps1 deletion implies the FOG flow changed — confirm it's superseded).
2. Add an `iam-os` `BootProfile` (iPXE `sanboot` over iSCSI to `iqn.2026-06.nl.omiximo:iam-os-dev`) so the appliance is selectable from the panel like other profiles (closes OQ-1).
3. Verify the iSCSI export end-to-end: install `tgt-iam-os.conf`, `tgt-admin --update ALL`, boot a KVM client off the 10.123.0.0/24 test subnet.
4. Populate `docs/` (empty) with a one-page operator runbook, or fold it into this file.

**Do not:**
- Do not commit the `iam-os` `.img` files (keep at `/srv/iam-os/`, out of git).
- Do not make the boot endpoint able to 5xx a booting client.
- Do not edit an already-applied migration; add a new numbered one.
- Do not send FOG tokens to the browser; proxy via `fog_client`.
- Do not turn dnsmasq into a DHCP lease server (proxyDHCP only).
- Do not expose the panel publicly without enforcing Cloudflare Access (`BT_CF_ACCESS_*`).

---

## §F — History (append-only)

- **2026-06-03** — `7868fed` single Docker Compose PXE platform: PG/Redis/FastAPI backend, Next.js panel, host-network pxe container (dnsmasq/nginx/samba), dynamic iPXE boot dispatch, intent/session model, Windows unattended + Alpine rescue + inventory + local_boot profiles.
- **2026-06** — `9681bb0` FOG Project imaging integration (iPXE handoff, capture/deploy via host API tasks).
- **2026-06** — `977b900` FOG management UI + backend proxy (tokens server-side).
- **2026-06-12** — built `iam-os-dev.img` (2.6 GB) into `/srv/iam-os/`; added iSCSI tgt target (`etc/iam-os/tgt-iam-os.conf`). In-flight backend/frontend/FOG changes left uncommitted.
- **2026-06-12** — CLAUDE.md + PROJECT.md working-memory docs authored (this framework) from a remote deep-dive. No pre-existing project docs to fold in (`docs/` was empty).

### Durable lessons
- The image is the heavy artifact; keeping `/srv/iam-os/*.img` out of git is why the repo stays clean — the repo describes how to build/serve it, not the bytes.
- The boot endpoint's never-fail contract (menu/local_boot fallback) is what makes the platform safe to point at a real fleet — preserve it above all.

---

## §G — Retrieval

### §G.1 Section extract
```bash
cd /home/adminuser/bootlab-pxe
sed -n '/^## §A/,/^## §B/p' PROJECT.md    # architecture
sed -n '/^## §B/,/^## §C/p' PROJECT.md    # decisions
sed -n '/^## §C/,/^## §D/p' PROJECT.md    # roadmap + OQs
sed -n '/^## §D/,/^## §E/p' PROJECT.md    # workstreams
sed -n '/^## §E/,/^## §F/p' PROJECT.md    # handoff
sed -n '/^## §F/,/^## §G/p' PROJECT.md    # history
sed -n '/^## §G/,$p'        PROJECT.md    # retrieval
```

### §G.2 Codebase map
- Boot core: `backend/app/routes_boot.py` (iPXE dispatch + dynamic unattend/post-install)
- State/progress: `backend/app/routes_stage.py`, `backend/app/events.py`, `backend/app/db.py`
- FOG: `backend/app/routes_fog.py`, `backend/app/fog_client.py`, `fog/ipxe/default.ipxe`
- Access: `backend/app/auth.py`, `backend/app/cloudflare_access.py`, `backend/app/config.py`
- Schema: `migrations/00{1..4}_*.sql`
- Panel: `frontend/src/app/{page,machines,profiles,intents,fog}`, `frontend/src/components/live-feed.tsx`
- PXE container: `pxe/{Dockerfile,entrypoint.sh,s6/,templates/}`
- iam-os image: `scripts/build-iam-os-dev-image.sh`, `etc/iam-os/tgt-iam-os.conf`, artifacts at `/srv/iam-os/`

### §G.3 Decision / config lookup
```bash
grep -rn "D-[0-9]" backend/ frontend/ pxe/        # decisions in code comments (if added)
grep -rn "BT_" backend/app/config.py docker-compose.yml   # all settings
ssh oopuopu-cloud "cat /home/adminuser/bootlab-pxe/etc/iam-os/tgt-iam-os.conf"
```

### §G.4 Run / inspect
```bash
cd /home/adminuser/bootlab-pxe && docker compose up -d   # full stack
curl -s localhost:8086/health                            # backend health
git log --oneline ; git status -s                        # state
```

### §G.5 External
- GitHub: `clubeedg-ship-it/bootlab-pxe` (private). Host: `oopuopu-cloud`. Panel: 127.0.0.1:3000, API: 127.0.0.1:8086, PXE http: :8085. iSCSI IQN: `iqn.2026-06.nl.omiximo:iam-os-dev`.
