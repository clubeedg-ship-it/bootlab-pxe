"""Async client for the FOG Project REST API.

The two auth tokens (``fog-api-token`` = global, ``fog-user-token`` = per-user)
are injected on every request and live only here + backend env — they are never
returned to the browser. Endpoints target FOG 1.5.x:
https://docs.fogproject.org/en/latest/kb/integrations/api/
"""
from typing import Any

import httpx

from .config import settings


class FogError(RuntimeError):
    """Any FOG API failure (unconfigured, unreachable, or non-2xx response)."""


def _items(data: Any, key: str) -> list[dict[str, Any]]:
    """FOG list endpoints return {"count": N, "<key>": [...]}, but some builds
    key by id or return a bare list. Normalize all of those to a list."""
    if isinstance(data, dict):
        v = data.get(key)
        if isinstance(v, list):
            return v
        if isinstance(v, dict):
            return list(v.values())
    if isinstance(data, list):
        return data
    return []


class FogClient:
    @property
    def configured(self) -> bool:
        return bool(
            settings.fog_api_base and settings.fog_api_token and settings.fog_user_token
        )

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        if not self.configured:
            raise FogError("FOG API not configured")
        url = f"{settings.fog_api_base.rstrip('/')}{path}"
        headers = {
            "fog-api-token": settings.fog_api_token,
            "fog-user-token": settings.fog_user_token,
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.request(method, url, headers=headers, **kwargs)
        except httpx.HTTPError as e:
            raise FogError(f"FOG {method} {path}: {e}") from e
        if resp.status_code >= 400:
            raise FogError(f"FOG {method} {path} -> {resp.status_code}: {resp.text[:200]}")
        if not resp.content:
            return None
        try:
            return resp.json()
        except ValueError:
            return resp.text

    async def system_info(self) -> Any:
        return await self._request("GET", "/system/info")

    async def list_images(self) -> list[dict[str, Any]]:
        return _items(await self._request("GET", "/image"), "images")

    async def list_active_tasks(self) -> list[dict[str, Any]]:
        return _items(await self._request("GET", "/task/active"), "tasks")

    async def find_host_by_mac(self, mac: str) -> dict[str, Any] | None:
        hosts = _items(await self._request("GET", f"/host/search/{mac}"), "hosts")
        return hosts[0] if hosts else None

    async def create_host(self, name: str, mac: str, image_id: int) -> dict[str, Any]:
        body = {"name": name, "macs": [mac], "imageID": image_id}
        return await self._request("POST", "/host", json=body) or {}

    async def assign_image(self, host_id: int, image_id: int) -> Any:
        return await self._request("PUT", f"/host/{host_id}/edit", json={"imageID": image_id})

    async def create_deploy_task(self, host_id: int) -> dict[str, Any]:
        # taskTypeID 1 = Deploy (image -> disk). 2 would be Capture.
        return await self._request("POST", f"/host/{host_id}/task", json={"taskTypeID": 1}) or {}

    async def cancel_task(self, task_id: int) -> Any:
        return await self._request("DELETE", f"/task/{task_id}/cancel")


fog = FogClient()
