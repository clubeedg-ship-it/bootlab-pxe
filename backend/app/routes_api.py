"""REST API for the panel frontend."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import operator_identity, require_trusted_network
from .config import settings
from .db import AuditLog, BootIntent, BootProfile, BootSession, Machine, SetupScript, get_db
from .events import bus
from .schemas import (
    BootIntentCreate,
    BootIntentOut,
    BootProfileOut,
    BootSessionOut,
    DashboardStats,
    FingerprintIn,
    MachineOut,
    MachineUpdate,
    SetupScriptCreate,
    SetupScriptOut,
    SetupScriptUpdate,
)


router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_trusted_network)])


def operator_from(req: Request) -> str:
    return operator_identity(req)


# ---------- Dashboard ----------

@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats(db: AsyncSession = Depends(get_db)) -> DashboardStats:
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return DashboardStats(
        machines_total=(await db.scalar(select(func.count()).select_from(Machine))) or 0,
        sessions_active=(await db.scalar(
            select(func.count()).select_from(BootSession).where(BootSession.ended_at.is_(None))
        )) or 0,
        sessions_today=(await db.scalar(
            select(func.count()).select_from(BootSession).where(BootSession.started_at >= today_start)
        )) or 0,
        intents_pending=(await db.scalar(
            select(func.count()).select_from(BootIntent).where(BootIntent.consumed_at.is_(None))
        )) or 0,
        profiles_enabled=(await db.scalar(
            select(func.count()).select_from(BootProfile).where(BootProfile.enabled.is_(True))
        )) or 0,
    )


# ---------- Machines ----------

@router.get("/machines", response_model=list[MachineOut])
async def list_machines(db: AsyncSession = Depends(get_db)) -> list[MachineOut]:
    rows = (await db.execute(select(Machine).order_by(Machine.last_seen.desc()))).scalars()
    return [MachineOut.model_validate(m) for m in rows]


@router.get("/machines/{mac}", response_model=MachineOut)
async def get_machine(mac: str, db: AsyncSession = Depends(get_db)) -> MachineOut:
    m = await db.get(Machine, mac.lower())
    if not m:
        raise HTTPException(404, "Machine not found")
    return MachineOut.model_validate(m)


@router.patch("/machines/{mac}", response_model=MachineOut)
async def update_machine(
    mac: str, update: MachineUpdate, request: Request, db: AsyncSession = Depends(get_db)
) -> MachineOut:
    m = await db.get(Machine, mac.lower())
    if not m:
        raise HTTPException(404, "Machine not found")
    for k, v in update.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.add(AuditLog(
        operator=operator_from(request),
        action="machine.update",
        target_type="machine",
        target_id=mac.lower(),
        details=update.model_dump(exclude_unset=True),
    ))
    await db.commit()
    await db.refresh(m)
    return MachineOut.model_validate(m)


@router.post("/machines/{mac}/fingerprint", response_model=MachineOut)
async def submit_fingerprint(
    mac: str,
    fp: FingerprintIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MachineOut:
    """Receive a hardware fingerprint from the inventory boot script.

    No auth required at the endpoint level — the script POSTs from inside the
    LAN (which is already trusted by network_allowed). But we record the source
    IP for audit.
    """
    mac_norm = mac.lower().replace("-", ":")
    m = await db.get(Machine, mac_norm)
    if not m:
        # Inventory script might be early — create the stub
        m = Machine(mac=mac_norm)
        db.add(m)

    data = fp.model_dump(exclude_none=True)
    for k, v in data.items():
        setattr(m, k, v)
    m.inventoried_at = datetime.now(timezone.utc)

    db.add(AuditLog(
        operator=f"inventory-script:{request.client.host if request.client else 'unknown'}",
        action="machine.fingerprint",
        target_type="machine",
        target_id=mac_norm,
        details={"fields_updated": sorted(data.keys())},
    ))
    await db.commit()
    await db.refresh(m)

    await bus.publish("machine.fingerprinted", {
        "mac": mac_norm,
        "cpu": m.cpu_model,
        "gpu": m.gpu_model,
        "ram_gb": m.ram_gb,
    })
    return MachineOut.model_validate(m)


# ---------- Boot profiles ----------

@router.get("/profiles", response_model=list[BootProfileOut])
async def list_profiles(db: AsyncSession = Depends(get_db)) -> list[BootProfileOut]:
    rows = (await db.execute(select(BootProfile).order_by(BootProfile.name))).scalars()
    return [BootProfileOut.model_validate(p) for p in rows]


# ---------- Setup scripts (post-boot first-run scripts) ----------

@router.get("/setup-scripts", response_model=list[SetupScriptOut])
async def list_setup_scripts(db: AsyncSession = Depends(get_db)) -> list[SetupScriptOut]:
    rows = (await db.execute(
        select(SetupScript).order_by(SetupScript.run_order, SetupScript.name)
    )).scalars()
    return [SetupScriptOut.model_validate(s) for s in rows]


@router.post("/setup-scripts", response_model=SetupScriptOut, status_code=201)
async def create_setup_script(
    body: SetupScriptCreate, request: Request, db: AsyncSession = Depends(get_db)
) -> SetupScriptOut:
    existing = await db.scalar(select(SetupScript).where(SetupScript.name == body.name))
    if existing:
        raise HTTPException(409, f"A setup script named '{body.name}' already exists")
    s = SetupScript(**body.model_dump())
    db.add(s)
    db.add(AuditLog(
        operator=operator_from(request),
        action="script.create",
        target_type="setup_script",
        target_id=body.name,
        details={"language": body.language, "enabled": body.enabled},
    ))
    await db.commit()
    await db.refresh(s)
    return SetupScriptOut.model_validate(s)


@router.patch("/setup-scripts/{script_id}", response_model=SetupScriptOut)
async def update_setup_script(
    script_id: int, update: SetupScriptUpdate, request: Request,
    db: AsyncSession = Depends(get_db)
) -> SetupScriptOut:
    s = await db.get(SetupScript, script_id)
    if not s:
        raise HTTPException(404, "Setup script not found")
    fields = update.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] != s.name:
        clash = await db.scalar(select(SetupScript).where(SetupScript.name == fields["name"]))
        if clash:
            raise HTTPException(409, f"A setup script named '{fields['name']}' already exists")
    for k, v in fields.items():
        setattr(s, k, v)
    s.updated_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        operator=operator_from(request),
        action="script.update",
        target_type="setup_script",
        target_id=s.name,
        details={"fields": sorted(fields.keys())},
    ))
    await db.commit()
    await db.refresh(s)
    return SetupScriptOut.model_validate(s)


@router.delete("/setup-scripts/{script_id}", status_code=204)
async def delete_setup_script(
    script_id: int, request: Request, db: AsyncSession = Depends(get_db)
) -> None:
    s = await db.get(SetupScript, script_id)
    if not s:
        raise HTTPException(404, "Setup script not found")
    name = s.name
    await db.delete(s)
    db.add(AuditLog(
        operator=operator_from(request),
        action="script.delete",
        target_type="setup_script",
        target_id=name,
    ))
    await db.commit()


# ---------- Boot intents ----------

@router.get("/intents", response_model=list[BootIntentOut])
async def list_intents(
    mac: str | None = None, pending_only: bool = True, db: AsyncSession = Depends(get_db)
) -> list[BootIntentOut]:
    q = select(BootIntent).order_by(BootIntent.set_at.desc())
    if mac:
        q = q.where(BootIntent.mac == mac.lower())
    if pending_only:
        q = q.where(BootIntent.consumed_at.is_(None))
    rows = (await db.execute(q)).scalars()
    return [BootIntentOut.model_validate(i) for i in rows]


@router.post("/intents", response_model=BootIntentOut, status_code=201)
async def create_intent(
    intent: BootIntentCreate, request: Request, db: AsyncSession = Depends(get_db)
) -> BootIntentOut:
    mac = intent.mac.lower()

    # Ensure machine exists (creates a stub if first time)
    m = await db.get(Machine, mac)
    if not m:
        db.add(Machine(mac=mac))

    # Validate profile exists
    p = await db.get(BootProfile, intent.profile)
    if not p:
        raise HTTPException(400, f"Profile '{intent.profile}' does not exist")

    operator = operator_from(request)
    bi = BootIntent(
        mac=mac,
        profile=intent.profile,
        parameters=intent.parameters,
        one_shot=intent.one_shot,
        notes=intent.notes,
        set_by=operator,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.boot_intent_ttl_minutes),
    )
    db.add(bi)
    db.add(AuditLog(
        operator=operator,
        action="intent.create",
        target_type="machine",
        target_id=mac,
        details={"profile": intent.profile, "one_shot": intent.one_shot},
    ))
    await db.commit()
    await db.refresh(bi)

    await bus.publish("intent.created", {"id": bi.id, "mac": mac, "profile": intent.profile})
    return BootIntentOut.model_validate(bi)


@router.delete("/intents/{intent_id}", status_code=204)
async def cancel_intent(
    intent_id: int, request: Request, db: AsyncSession = Depends(get_db)
) -> None:
    bi = await db.get(BootIntent, intent_id)
    if not bi:
        raise HTTPException(404, "Intent not found")
    if bi.consumed_at is not None:
        raise HTTPException(409, "Intent already consumed")
    bi.consumed_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        operator=operator_from(request),
        action="intent.cancel",
        target_type="intent",
        target_id=str(intent_id),
    ))
    await db.commit()


# ---------- Boot sessions ----------

@router.get("/sessions", response_model=list[BootSessionOut])
async def list_sessions(
    active_only: bool = False, mac: str | None = None, limit: int = 100,
    db: AsyncSession = Depends(get_db)
) -> list[BootSessionOut]:
    q = select(BootSession).order_by(BootSession.started_at.desc()).limit(limit)
    if active_only:
        q = q.where(BootSession.ended_at.is_(None))
    if mac:
        q = q.where(BootSession.mac == mac.lower())
    rows = (await db.execute(q)).scalars()
    return [BootSessionOut.model_validate(s) for s in rows]


# ---------- Live event stream ----------

@router.websocket("/events")
async def events(ws: WebSocket) -> None:
    await ws.accept()
    try:
        async for message in bus.subscribe():
            await ws.send_text(message)
    except WebSocketDisconnect:
        return
