from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import settings


engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


class Machine(Base):
    __tablename__ = "machines"

    mac: Mapped[str] = mapped_column(String, primary_key=True)
    hostname: Mapped[str | None] = mapped_column(String)
    asset_tag: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_ip: Mapped[str | None] = mapped_column(INET)
    vendor: Mapped[str | None] = mapped_column(String)
    arch: Mapped[str | None] = mapped_column(String)
    # Hardware fingerprint (captured from SMBIOS at PXE boot time)
    manufacturer: Mapped[str | None] = mapped_column(String)
    product: Mapped[str | None] = mapped_column(String)
    serial: Mapped[str | None] = mapped_column(String)
    system_uuid: Mapped[str | None] = mapped_column(String)
    bios_vendor: Mapped[str | None] = mapped_column(String)
    nic_vendor: Mapped[str | None] = mapped_column(String)
    # Full components (from inventory boot profile — Alpine + lshw)
    cpu_model: Mapped[str | None] = mapped_column(String)
    cpu_cores: Mapped[int | None] = mapped_column(Integer)
    cpu_threads: Mapped[int | None] = mapped_column(Integer)
    gpu_model: Mapped[str | None] = mapped_column(String)
    gpu_vram_mb: Mapped[int | None] = mapped_column(Integer)
    ram_gb: Mapped[int | None] = mapped_column(Integer)
    ram_modules: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    storage_total_gb: Mapped[int | None] = mapped_column(Integer)
    storage_devices: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    inventoried_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BootProfile(Base):
    __tablename__ = "boot_profiles"

    name: Mapped[str] = mapped_column(String, primary_key=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[str | None] = mapped_column(String)
    ipxe_template: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SetupScript(Base):
    __tablename__ = "setup_scripts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String, nullable=False, default="powershell")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    run_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BootIntent(Base):
    __tablename__ = "boot_intents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    mac: Mapped[str] = mapped_column(String, ForeignKey("machines.mac", ondelete="CASCADE"), nullable=False)
    profile: Mapped[str] = mapped_column(String, ForeignKey("boot_profiles.name"), nullable=False)
    parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    set_by: Mapped[str | None] = mapped_column(String)
    set_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    one_shot: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)


class BootSession(Base):
    __tablename__ = "boot_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    mac: Mapped[str] = mapped_column(String, ForeignKey("machines.mac", ondelete="CASCADE"), nullable=False)
    intent_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("boot_intents.id"))
    profile: Mapped[str | None] = mapped_column(String, ForeignKey("boot_profiles.name"))
    client_ip: Mapped[str | None] = mapped_column(INET)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="active")
    stages: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    bytes_served: Mapped[int] = mapped_column(BigInteger, default=0)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    operator: Mapped[str | None] = mapped_column(String)
    operator_ip: Mapped[str | None] = mapped_column(INET)
    action: Mapped[str] = mapped_column(String, nullable=False)
    target_type: Mapped[str | None] = mapped_column(String)
    target_id: Mapped[str | None] = mapped_column(String)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    success: Mapped[bool] = mapped_column(Boolean, default=True)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
