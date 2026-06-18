# bootlab-pxe (iam-os) — agent memory (always loaded)

Short snapshot + rules. Long-form lives in `PROJECT.md`, retrieved by section anchor (`sed -n '/^## §X/,/^## §Y/p' PROJECT.md`).

## 1. Identity
- Project: `bootlab-pxe` ("iam-os") — a single-Docker-Compose **PXE network-boot & imaging platform** ("Omiximo Blue Team Boot") plus `iam-os`, the diskless Linux appliance image it serves over iSCSI.
- Repo: `/home/adminuser/bootlab-pxe` on server `oopuopu-cloud` (work only here)
- GitHub: `clubeedg-ship-it/bootlab-pxe` (private)
- Branch: `main` (single line of work; greenfield — 3 commits in)
- The `iam-os` image artifacts live OUTSIDE the repo at `/srv/iam-os/*.img`, served via tgt iSCSI (`etc/iam-os/tgt-iam-os.conf`).

## 2. Session start
Read `PROJECT.md §E` (handoff) first. Then `§A` if the task is architectural, `§D` for your lane (backend / frontend / pxe / image). Read only the route/template/migration the task cites — never the whole tree. Prefer `§G` retrieval snippets over repo-wide search.

## 3. Behaviors (every task — bias to caution; judgment on trivial ones)
- Think before coding — state assumptions; if ambiguous, ask; surface tradeoffs.
- Simplicity first — minimum that solves it; no speculative abstractions.
- Surgical changes — touch only what the task needs; match existing style; flag dead code, don't delete it.
- Goal-driven — turn tasks into verifiable goals; boot/imaging paths are hard to unit-test, so prove with a real PXE/curl round-trip where possible.

## 4. Vocabulary
- `Machine` = a fleet PC keyed by MAC; hardware-fingerprinted from iPXE SMBIOS + the inventory profile.
- `BootProfile` = a named iPXE script template (`deploy_windows`, `alpine_rescue`, `inventory`, `local_boot`, FOG handoff).
- `BootIntent` = a queued one-shot decision: "next time MAC X boots, run profile Y" — consumed on boot.
- `BootSession` = one PXE boot lifecycle; accumulates `stages` (JSONB timeline) reported back by the client.
- `Stage` = a progress beat (`ipxe_request`, install steps, firstboot) POSTed to `/machines/{mac}/stage`.
- `FOG` = external FOG Project imaging appliance; the panel proxies its REST API (tokens stay server-side).
- `iam-os` = the diskless dev appliance image served read-write over iSCSI to a client.
- `Trusted network` = LAN / Tailscale / localhost; public hosts gated by Cloudflare Access JWT.

## 5. Invariants (byte-identical mirror of `PROJECT.md §A.10`)
- `GET /api/v1/boot/{mac}.ipxe` is the heart of the platform — it never 5xx-fails a booting client; worst case it returns a menu or a `local_boot` fall-through.
- A pending one-shot `BootIntent` is consumed exactly once (`consumed_at` set in the same boot transaction).
- First-sighting of a MAC auto-queues the `inventory` profile so the fleet is always fingerprinted.
- FOG API tokens never reach the browser — the backend is the only FOG client (`fog_client`).
- Every state-changing panel call passes `require_trusted_network` (LAN/Tailscale, or Cloudflare Access JWT on a trusted public host).
- dnsmasq runs as the LAN's single proxyDHCP; it never hands out leases, only PXE chainload.
- All backend env config is `BT_`-prefixed; `BT_PXE_SERVER` MUST be set (no safe default).
- The `iam-os` image lives at `/srv/iam-os/`, outside the repo; the repo ships only its tgt target + build script.
- MACs are normalized to lower-colon form at every entry point before any DB touch.

## 6. Current snapshot
> Overwritten at session close.
- branch: `main`; 3 commits (compose platform → FOG imaging → FOG management UI). HEAD `977b900`.
- **State (2026-06-12):** core platform built and running (Postgres+Redis+FastAPI backend, Next.js panel, PXE container). FOG integration landed. A fresh `iam-os` dev image was just built into `/srv/iam-os/iam-os-dev.img` (2.6 GB) and its iSCSI target config added (`etc/iam-os/`).
- **Uncommitted WIP:** ~10 modified files (backend `db/routes_api/routes_boot/schemas`, post-install template, FOG iPXE, frontend nav/api); `fog/scripts/post-deploy.ps1` staged-deleted. Not yet committed.
- next: wire the new `iam-os` iSCSI appliance in as a bootable profile and commit the in-flight FOG/post-install changes.

## 7. Pointer table — `PROJECT.md`
| Anchor | Content | Cadence |
|---|---|---|
| `§A` | Architecture + invariants | PR-gated |
| `§B` | Decisions (D-NN) | append-only |
| `§C` | Roadmap & open questions | overwrite |
| `§D` | Workstreams (backend / frontend / pxe / image) | overwrite |
| `§E` | Handoff (current next-step) | overwrite |
| `§F` | History | append-only |
| `§G` | Retrieval | overwrite |

## 8. Execution & write rules
- One lane per task (`backend` / `frontend` / `pxe` / `image`); don't mix unless explicitly cross-contract.
- Per-section cadence: `§A` PR-gated · `§B`/`§F` append-only · `§C §D §E §G` overwrite · `§6 snapshot` overwrite at session close.
- New schema → forward-only numbered migration in `migrations/`; never edit an applied one.
- Don't create new top-level planning files when `CLAUDE.md` or `PROJECT.md` can hold the truth.

## 9. Session close
1. Decision landed? → append `PROJECT.md §B`. 2. Durable lesson? → `§F`. 3. Next-step changed? → overwrite `§E`. 4. Update §6 snapshot above.
