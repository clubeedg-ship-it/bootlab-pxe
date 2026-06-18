"""Dynamic iPXE generation — the heart of the platform.

When a PXE client boots, iPXE chainloads to /api/v1/boot/<mac>.ipxe.
This endpoint:
  1. Records/updates the machine in the fleet
  2. Opens a boot session
  3. Looks up any queued boot intent for this MAC
  4. Returns the appropriate iPXE script (specific profile OR interactive menu)
"""
from datetime import datetime, timezone
from pathlib import Path
from string import Template

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from jinja2 import Environment, FileSystemLoader
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from . import oui
from .config import settings
from .db import BootIntent, BootProfile, BootSession, Machine, SetupScript, get_db
from .events import bus
from .locales import get_locale, LOCALES


router = APIRouter(tags=["boot"])

_jinja = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=False,
)


def normalize_mac(raw: str) -> str:
    """iPXE sends MAC as XX-XX-XX-XX-XX-XX (hexhyp). Normalize to lower colon form."""
    cleaned = raw.lower().removesuffix(".ipxe")
    return cleaned.replace("-", ":")


def render_menu(profiles: list[BootProfile], default: str) -> str:
    items: list[str] = []
    for i, p in enumerate(profiles, 1):
        key = str(i) if i < 10 else chr(ord("a") + i - 10)
        items.append(f"item --key {key} {p.name} [{key}] {p.display_name}")

    boot_branches: list[str] = []
    for p in profiles:
        body = Template(p.ipxe_template).safe_substitute(
            pxe_server=settings.pxe_server, fog_server=settings.fog_server
        ).rstrip()
        # If the template ends with `boot` or `boot ...`, replace it with cancel-fallback variant
        if body.endswith("\nboot"):
            body = body[: -len("boot")] + "boot || goto cancel"
        boot_branches.append(f":{p.name}\n{body}")

    return "\n".join([
        "#!ipxe",
        "",
        ":start",
        "menu Omiximo Blue Team Boot",
        *items,
        f"choose --default {default} --timeout 10000 selected || goto cancel",
        "goto ${selected}",
        "",
        ":cancel",
        "echo Boot cancelled - falling through to local disk",
        "sanboot --no-describe --drive 0x80 || exit",
        "",
        *boot_branches,
        "",
    ])


def render_profile(profile: BootProfile) -> str:
    body = Template(profile.ipxe_template).safe_substitute(
        pxe_server=settings.pxe_server, fog_server=settings.fog_server
    )
    return "\n".join([
        "#!ipxe",
        "",
        "echo",
        "echo ============================================",
        "echo  Omiximo Blue Team Boot",
        f"echo  Profile: {profile.display_name}",
        "echo ============================================",
        "echo",
        "",
        body,
        "",
    ])


def _clean(s: str | None) -> str | None:
    """SMBIOS fields are noisy: empty strings, 'To Be Filled By O.E.M.', etc."""
    if not s:
        return None
    s = s.strip()
    if not s:
        return None
    junk = {"to be filled by o.e.m.", "system manufacturer", "system product name",
            "default string", "not specified", "not applicable", "n/a", "0", "none",
            "unknown", "system serial number"}
    if s.lower() in junk:
        return None
    return s


@router.get("/boot/{mac}.ipxe")
async def boot_dispatch(
    mac: str,
    request: Request,
    manufacturer: str | None = Query(default=None),
    product: str | None = Query(default=None),
    serial: str | None = Query(default=None),
    uuid: str | None = Query(default=None),
    bios_vendor: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> Response:
    mac_norm = normalize_mac(mac)
    client_ip = request.client.host if request.client else None
    now = datetime.now(timezone.utc)

    # Is this a brand-new MAC? Check before upsert.
    existing = (await db.execute(select(Machine).where(Machine.mac == mac_norm))).scalar_one_or_none()
    is_first_sighting = existing is None

    # Hardware fingerprint from iPXE SMBIOS
    hw = {
        "manufacturer": _clean(manufacturer),
        "product": _clean(product),
        "serial": _clean(serial),
        "system_uuid": _clean(uuid),
        "bios_vendor": _clean(bios_vendor),
        "nic_vendor": oui.lookup(mac_norm),
    }
    # Drop None values so upsert only updates what we have
    hw_set = {k: v for k, v in hw.items() if v is not None}

    # Upsert the machine — refresh last_seen + hardware info if newer iPXE gives more
    values = {"mac": mac_norm, "last_ip": client_ip, "last_seen": now, **hw_set}
    stmt = pg_insert(Machine).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["mac"],
        set_={"last_seen": now, "last_ip": client_ip, **hw_set},
    )
    await db.execute(stmt)

    # Auto-queue inventory for first-time machines so we know their components
    if is_first_sighting:
        inventory_exists = (await db.execute(
            select(BootProfile).where(BootProfile.name == "inventory")
        )).scalar_one_or_none()
        if inventory_exists:
            db.add(BootIntent(
                mac=mac_norm,
                profile="inventory",
                set_by="auto:first-sighting",
                notes="Auto-queued on first PXE boot to gather components.",
                one_shot=True,
            ))

    # Look for a pending intent
    intent_q = (
        select(BootIntent)
        .where(BootIntent.mac == mac_norm)
        .where(BootIntent.consumed_at.is_(None))
        .order_by(BootIntent.set_at.desc())
        .limit(1)
    )
    intent = (await db.execute(intent_q)).scalar_one_or_none()

    chosen_profile: BootProfile | None = None
    if intent is not None:
        chosen_profile = (
            await db.execute(select(BootProfile).where(BootProfile.name == intent.profile))
        ).scalar_one_or_none()

    # Get enabled profiles for menu fallback
    all_profiles = list(
        (
            await db.execute(
                select(BootProfile).where(BootProfile.enabled.is_(True)).order_by(BootProfile.name)
            )
        ).scalars()
    )

    # Open a session
    session = BootSession(
        mac=mac_norm,
        intent_id=intent.id if intent else None,
        profile=chosen_profile.name if chosen_profile else None,
        client_ip=client_ip,
        stages=[{"stage": "ipxe_request", "ts": now.isoformat()}],
    )
    db.add(session)

    # Consume intent
    if intent and intent.one_shot:
        intent.consumed_at = now

    await db.flush()
    await db.commit()
    await db.refresh(session)

    await bus.publish("session.started", {
        "session_id": session.id,
        "mac": mac_norm,
        "profile": chosen_profile.name if chosen_profile else None,
        "client_ip": client_ip,
        "decision": "intent" if intent else "menu",
    })

    if chosen_profile:
        script = render_profile(chosen_profile)
    elif all_profiles:
        default = (
            "deploy_windows"
            if any(p.name == "deploy_windows" for p in all_profiles)
            else all_profiles[0].name
        )
        script = render_menu(all_profiles, default)
    else:
        script = "#!ipxe\necho No boot profiles configured\nexit\n"

    return Response(content=script, media_type="text/plain")


# ---- Dynamic autounattend.xml (per-machine, per-language) ----

@router.get("/machines/{mac}/autounattend.xml")
async def dynamic_autounattend(
    mac: str,
    lang: str = Query(default="nl-NL"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    mac_norm = normalize_mac(mac)

    try:
        locale = get_locale(lang)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    # Look up hostname from intent parameters or machine record
    machine = await db.get(Machine, mac_norm)
    hostname = "BOOTLAB-PC"
    if machine:
        if machine.hostname:
            hostname = machine.hostname
        elif machine.serial:
            hostname = f"BL-{machine.serial[-8:]}"

    tpl = _jinja.get_template("autounattend.xml.j2")
    xml = tpl.render(
        lang=lang,
        locale=locale,
        hostname=hostname,
        mac=mac_norm.replace(":", "-"),
        pxe_server=settings.pxe_server,
        pxe_http_port=settings.pxe_http_port,
    )
    return Response(content=xml, media_type="application/xml")


# ---- Dynamic post-install.ps1 (per-machine, per-language) ----

@router.get("/machines/{mac}/post-install.ps1")
async def dynamic_postinstall(
    mac: str,
    lang: str = Query(default="nl-NL"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    mac_norm = normalize_mac(mac)

    try:
        locale = get_locale(lang)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    tpl = _jinja.get_template("post-install.ps1.j2")
    script = tpl.render(
        lang=lang,
        locale=locale,
        mac=mac_norm.replace(":", "-"),
        pxe_server=settings.pxe_server,
        pxe_http_port=settings.pxe_http_port,
    )
    return Response(content=script, media_type="text/plain")


# ---- Assembled first-boot script for the FOG path ----
# Served to a freshly-imaged machine by the baked SetupComplete.cmd bootstrap.
# Concatenates the operator's enabled setup_scripts (managed from the panel)
# into one PowerShell document that runs once, as SYSTEM, with no logon.

_FIRSTBOOT_HEADER = """#Requires -RunAsAdministrator
$ErrorActionPreference = "Continue"
$PXE_SERVER = "{pxe_server}"
$PXE_BASE   = "http://{pxe_server}:{pxe_http_port}"
$WorkDir    = "C:\\PXE"
$Log        = Join-Path $WorkDir "firstboot.log"
New-Item -Path $WorkDir -ItemType Directory -Force | Out-Null

function Write-Log {{ param([string]$m)
    ("{{0}} - {{1}}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $m) | Tee-Object -FilePath $Log -Append
}}

function Report-Stage {{ param([string]$Stage)
    try {{
        $mac = (Get-CimInstance Win32_NetworkAdapterConfiguration |
                Where-Object {{ $_.IPEnabled -and $_.MACAddress }} |
                Select-Object -First 1).MACAddress
        if ($mac) {{
            $mac = $mac.Replace(":", "-")
            $body = @{{ stage = $Stage }} | ConvertTo-Json
            Invoke-WebRequest -Uri "$PXE_BASE/api/v1/machines/$mac/stage" -Method POST `
                -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 5 | Out-Null
        }}
    }} catch {{}}
}}

Write-Log "=== firstboot started (server $PXE_SERVER) ==="
Report-Stage "firstboot_started"
"""

_FIRSTBOOT_FOOTER = """
Write-Log "=== firstboot completed ==="
Report-Stage "firstboot_done"
exit 0
"""


@router.get("/setup/firstboot.ps1")
async def firstboot_script(db: AsyncSession = Depends(get_db)) -> Response:
    rows = list((await db.execute(
        select(SetupScript)
        .where(SetupScript.enabled.is_(True))
        .order_by(SetupScript.run_order, SetupScript.name)
    )).scalars())

    parts: list[str] = [
        _FIRSTBOOT_HEADER.format(
            pxe_server=settings.pxe_server,
            pxe_http_port=settings.pxe_http_port,
        )
    ]

    for s in rows:
        parts.append(f'\nWrite-Log "--- running {s.name} ({s.language}) ---"')
        parts.append(f'Report-Stage "script:{s.name}"')
        parts.append("try {")
        if s.language == "batch":
            # Write the batch body to a file and invoke it via cmd /c.
            safe = s.name.replace('"', "").replace("'", "")
            cmd_path = f"$WorkDir\\{safe}.cmd"
            parts.append(f'    $cmd = "{cmd_path}"')
            parts.append("    @'")
            parts.append(s.content.rstrip("\n"))
            parts.append("'@ | Set-Content -Path $cmd -Encoding ASCII")
            parts.append('    & cmd.exe /c $cmd')
        else:
            parts.append(s.content.rstrip("\n"))
        parts.append("} catch {")
        parts.append(f'    Write-Log "  ERROR in {s.name}: $($_.Exception.Message)"')
        parts.append("}")

    parts.append(_FIRSTBOOT_FOOTER)
    return Response(content="\n".join(parts), media_type="text/plain")
