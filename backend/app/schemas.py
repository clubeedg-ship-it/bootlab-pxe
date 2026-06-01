from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, field_validator


def _ip_to_str(v: Any) -> str | None:
    if v is None:
        return None
    return str(v)


class MachineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mac: str
    hostname: str | None
    asset_tag: str | None
    notes: str | None
    first_seen: datetime
    last_seen: datetime
    last_ip: str | None
    vendor: str | None
    arch: str | None
    manufacturer: str | None
    product: str | None
    serial: str | None
    system_uuid: str | None
    bios_vendor: str | None
    nic_vendor: str | None
    # Components
    cpu_model: str | None
    cpu_cores: int | None
    cpu_threads: int | None
    gpu_model: str | None
    gpu_vram_mb: int | None
    ram_gb: int | None
    ram_modules: list[dict[str, Any]] | None
    storage_total_gb: int | None
    storage_devices: list[dict[str, Any]] | None
    inventoried_at: datetime | None

    @field_validator("last_ip", mode="before")
    @classmethod
    def _norm_ip(cls, v: Any) -> str | None:
        return _ip_to_str(v)


class FingerprintIn(BaseModel):
    """POSTed by the inventory boot script after gathering hardware."""
    cpu_model: str | None = None
    cpu_cores: int | None = None
    cpu_threads: int | None = None
    gpu_model: str | None = None
    gpu_vram_mb: int | None = None
    ram_gb: int | None = None
    ram_modules: list[dict[str, Any]] | None = None
    storage_total_gb: int | None = None
    storage_devices: list[dict[str, Any]] | None = None
    # Also accept refreshed SMBIOS in case iPXE missed some
    manufacturer: str | None = None
    product: str | None = None
    serial: str | None = None
    system_uuid: str | None = None
    bios_vendor: str | None = None


class MachineUpdate(BaseModel):
    hostname: str | None = None
    asset_tag: str | None = None
    notes: str | None = None


class BootProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    display_name: str
    description: str | None
    category: str
    icon: str | None
    enabled: bool


class BootIntentCreate(BaseModel):
    mac: str
    profile: str
    parameters: dict[str, Any] = {}
    one_shot: bool = True
    notes: str | None = None


class BootIntentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mac: str
    profile: str
    parameters: dict[str, Any]
    set_by: str | None
    set_at: datetime
    consumed_at: datetime | None
    expires_at: datetime | None
    one_shot: bool
    notes: str | None


class BootSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mac: str
    intent_id: int | None
    profile: str | None
    client_ip: str | None
    started_at: datetime
    ended_at: datetime | None
    status: str
    stages: list[dict[str, Any]]
    bytes_served: int

    @field_validator("client_ip", mode="before")
    @classmethod
    def _norm_ip(cls, v: Any) -> str | None:
        return _ip_to_str(v)


class DashboardStats(BaseModel):
    machines_total: int
    sessions_active: int
    sessions_today: int
    intents_pending: int
    profiles_enabled: int
