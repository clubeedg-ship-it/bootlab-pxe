"""Stage reporting endpoint — called anonymously by PXE clients."""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from .db import BootSession, Machine, get_db
from .events import bus

router = APIRouter(prefix="/api/v1")

DbDep = Annotated[AsyncSession, Depends(get_db)]


class StageUpdate(BaseModel):
    stage: str
    lang: str | None = None
    manufacturer: str | None = None
    product: str | None = None
    serial: str | None = None
    error: str | None = None
    message: str | None = None


@router.post("/machines/{mac}/stage")
async def report_stage(mac: str, body: StageUpdate, db: DbDep) -> dict:
    # 1. Normalise MAC
    mac = mac.replace("-", ":").lower()

    # 2. Upsert machine stub; update SMBIOS fields when present
    values: dict = {"mac": mac}
    update_values: dict = {}
    for field in ("manufacturer", "product", "serial"):
        val = getattr(body, field)
        if val is not None:
            update_values[field] = val

    stmt = (
        pg_insert(Machine)
        .values(**values)
        .on_conflict_do_update(
            index_elements=["mac"],
            set_=update_values if update_values else {"mac": mac},
        )
    )
    await db.execute(stmt)

    # 3. Find the latest active BootSession for this MAC
    result = await db.execute(
        select(BootSession)
        .where(BootSession.mac == mac, BootSession.ended_at.is_(None))
        .order_by(BootSession.started_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()

    # 4. Append stage to the JSONB stages array
    if session is not None:
        entry = {
            "stage": body.stage,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        if body.lang:
            entry["lang"] = body.lang
        if body.error:
            entry["error"] = body.error
        if body.message:
            entry["message"] = body.message

        current: list = list(session.stages or [])
        current.append(entry)
        session.stages = current
        await db.commit()

    # 5. Publish WebSocket event
    await bus.publish(
        "stage.update",
        {
            "mac": mac,
            "stage": body.stage,
            "lang": body.lang,
            "manufacturer": body.manufacturer,
            "product": body.product,
            "serial": body.serial,
            "error": body.error,
            "message": body.message,
            "session_id": session.id if session else None,
        },
    )

    # 6. Return confirmation
    return {"status": "ok", "stage": body.stage}
