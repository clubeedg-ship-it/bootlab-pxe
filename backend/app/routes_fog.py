"""FOG Project management proxy for the panel.

The browser only ever calls /api/v1/fog/* — the FOG API tokens stay in the
backend (see fog_client). Deploys go through the registered-host + API task
path (taskTypeID=1) so they appear in FOG's active-task list with progress;
the at-machine iPXE quick-deploy path is intentionally untracked.
"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import operator_identity, require_trusted_network
from .db import AuditLog, Machine, get_db
from .events import bus
from .fog_client import FogError, fog
from .schemas import FogDeployIn, FogDeployOut, FogHealth, FogImageOut, FogTaskOut


router = APIRouter(
    prefix="/api/v1/fog",
    tags=["fog"],
    dependencies=[Depends(require_trusted_network)],
)


def _to_int(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace("%", "").strip())
    except (TypeError, ValueError):
        return None


def _image_out(raw: dict[str, Any]) -> FogImageOut:
    return FogImageOut(
        id=_to_int(raw.get("id")) or 0,
        name=raw.get("name") or "",
        path=raw.get("path"),
        os=str(raw["os"]) if raw.get("os") not in (None, "") else None,
        format=str(raw["format"]) if raw.get("format") not in (None, "") else None,
        size_bytes=_to_int(raw.get("size")),
    )


def _task_out(raw: dict[str, Any]) -> FogTaskOut:
    host = raw.get("host") or {}
    image = raw.get("image") or {}
    macs = host.get("macs") or []
    mac = None
    if macs:
        first = macs[0]
        mac = first.get("mac") if isinstance(first, dict) else str(first)
    pct = raw.get("percent")
    if pct in (None, ""):
        pct = raw.get("pct")
    return FogTaskOut(
        id=_to_int(raw.get("id")) or 0,
        host_id=_to_int(host.get("id")),
        host_name=host.get("name"),
        mac=mac,
        image_name=image.get("name") or raw.get("imagename"),
        percent=_to_float(pct),
        time_elapsed=raw.get("timeElapsed") or None,
        time_remaining=raw.get("timeRemaining") or None,
        data_copied=raw.get("dataCopied") or None,
        data_total=raw.get("dataTotal") or None,
        state=str(raw["stateID"]) if raw.get("stateID") is not None else None,
    )


@router.get("/health", response_model=FogHealth)
async def fog_health() -> FogHealth:
    if not fog.configured:
        return FogHealth(enabled=False, reachable=False)
    try:
        await fog.system_info()
        return FogHealth(enabled=True, reachable=True)
    except FogError:
        return FogHealth(enabled=True, reachable=False)


@router.get("/images", response_model=list[FogImageOut])
async def fog_images() -> list[FogImageOut]:
    if not fog.configured:
        return []
    try:
        return [_image_out(i) for i in await fog.list_images()]
    except FogError as e:
        raise HTTPException(502, f"FOG unavailable: {e}") from e


@router.get("/tasks/active", response_model=list[FogTaskOut])
async def fog_active_tasks() -> list[FogTaskOut]:
    if not fog.configured:
        return []
    try:
        return [_task_out(t) for t in await fog.list_active_tasks()]
    except FogError as e:
        raise HTTPException(502, f"FOG unavailable: {e}") from e


@router.post("/deploy", response_model=FogDeployOut)
async def fog_deploy(
    body: FogDeployIn, request: Request, db: AsyncSession = Depends(get_db)
) -> FogDeployOut:
    mac = body.mac.lower()

    # Name the FOG host from the bootlab machine record if we know it.
    machine = await db.get(Machine, mac)
    name = None
    if machine:
        name = machine.hostname or (f"BL-{machine.serial[-8:]}" if machine.serial else None)
    name = name or f"bl-{mac.replace(':', '')[-8:]}"

    try:
        host = await fog.find_host_by_mac(mac)
        if host:
            host_id = _to_int(host.get("id"))
            await fog.assign_image(host_id, body.image_id)
        else:
            created = await fog.create_host(name, mac, body.image_id)
            host_id = _to_int(created.get("id"))
            if host_id is None:  # some builds don't echo the id on create
                host = await fog.find_host_by_mac(mac)
                host_id = _to_int(host.get("id")) if host else None
        if host_id is None:
            raise HTTPException(502, "FOG did not return a host id")

        task = await fog.create_deploy_task(host_id)
        task_id = _to_int(task.get("id")) or _to_int((task.get("task") or {}).get("id"))
        if task_id is None:  # fall back to the freshly-created active task
            for t in await fog.list_active_tasks():
                if _to_int((t.get("host") or {}).get("id")) == host_id:
                    task_id = _to_int(t.get("id"))
                    break
    except FogError as e:
        raise HTTPException(502, f"FOG deploy failed: {e}") from e

    if task_id is None:
        raise HTTPException(502, "FOG deploy task created but no task id returned")

    db.add(AuditLog(
        operator=operator_identity(request),
        action="fog.deploy",
        target_type="machine",
        target_id=mac,
        details={"image_id": body.image_id, "host_id": host_id, "task_id": task_id, "lang": body.lang},
    ))
    await db.commit()
    await bus.publish("fog.deploy.started", {
        "mac": mac, "image_id": body.image_id, "task_id": task_id, "host_id": host_id,
    })
    return FogDeployOut(task_id=task_id, host_id=host_id)


@router.delete("/tasks/{task_id}", status_code=204)
async def fog_cancel_task(
    task_id: int, request: Request, db: AsyncSession = Depends(get_db)
) -> None:
    try:
        await fog.cancel_task(task_id)
    except FogError as e:
        raise HTTPException(502, f"FOG cancel failed: {e}") from e
    db.add(AuditLog(
        operator=operator_identity(request),
        action="fog.cancel",
        target_type="fog_task",
        target_id=str(task_id),
    ))
    await db.commit()
    await bus.publish("fog.deploy.cancelled", {"task_id": task_id})
