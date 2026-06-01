"""Access control.

Two layers, in order of precedence:

1. Trusted networks (always allowed):
   - localhost, LAN (192.168.0.0/24), Tailscale (100.64.0.0/10)
   - Operator identity: "lan:<ip>" or Tailscale headers

2. Trusted public hostnames (e.g. boot.abbamarkt.nl via Cloudflare):
   - If Cloudflare Access is configured (cf_access_team_domain + cf_access_aud):
     - Require a valid Cf-Access-Jwt-Assertion → identity from JWT email
   - If CF Access is NOT configured:
     - Allow through (warn-mode) — assume upstream protection. Set both
       BT_CF_ACCESS_TEAM_DOMAIN and BT_CF_ACCESS_AUD in env to enforce.

Anything else: 403.
"""
import logging
from ipaddress import IPv4Address, IPv4Network

import jwt
from fastapi import Header, HTTPException, Request

from . import cloudflare_access
from .config import settings


log = logging.getLogger(__name__)

def _build_allowed_nets() -> list[IPv4Network]:
    nets = [
        IPv4Network("127.0.0.0/8"),
        IPv4Network("100.64.0.0/10"),  # Tailscale CGNAT
    ]
    try:
        nets.append(IPv4Network(settings.lan_subnet, strict=False))
    except ValueError:
        log.warning("BT_LAN_SUBNET '%s' is not a valid IPv4 network; ignoring.", settings.lan_subnet)
    return nets


ALLOWED_NETS: list[IPv4Network] = _build_allowed_nets()

# Trusted public hostnames proxied through Cloudflare Access.
# To add more hosts without redeploying, set BT_TRUSTED_HOSTS as a
# comma-separated list in the environment (e.g. "boot.example.com,admin.example.com").
# The value below is the built-in fallback used when the env var is absent.
import os as _os
_trusted_hosts_env = _os.environ.get("BT_TRUSTED_HOSTS", "")
TRUSTED_HOSTS: set[str] = (
    {h.strip().lower() for h in _trusted_hosts_env.split(",") if h.strip()}
    if _trusted_hosts_env
    else {"boot.abbamarkt.nl"}
)


def _ip_allowed(ip_str: str | None) -> bool:
    if not ip_str:
        return False
    try:
        ip = IPv4Address(ip_str)
    except ValueError:
        return False
    return any(ip in net for net in ALLOWED_NETS)


def _extract_cf_jwt(request: Request) -> str | None:
    # Cloudflare Access sets both the header and cookie
    header = request.headers.get("Cf-Access-Jwt-Assertion")
    if header:
        return header
    return request.cookies.get("CF_Authorization")


async def require_trusted_network(
    request: Request,
    x_forwarded_for: str | None = Header(default=None),
    x_forwarded_host: str | None = Header(default=None),
    host: str | None = Header(default=None),
) -> None:
    # 1. Direct trusted-network access (LAN / Tailscale / localhost)
    real_ip = (x_forwarded_for or "").split(",")[0].strip() or (
        request.client.host if request.client else None
    )
    if _ip_allowed(real_ip):
        return

    # 2. Trusted public hostname
    raw_host = (x_forwarded_host or host or "").split(",")[0].strip()
    bare_host = raw_host.split(":")[0].lower()

    if bare_host in TRUSTED_HOSTS:
        if cloudflare_access.is_configured():
            token = _extract_cf_jwt(request)
            if not token:
                raise HTTPException(
                    status_code=401,
                    detail="Cloudflare Access JWT missing",
                )
            try:
                identity = cloudflare_access.verify(token)
            except jwt.PyJWTError as e:
                raise HTTPException(
                    status_code=401,
                    detail=f"Cloudflare Access JWT invalid: {type(e).__name__}",
                ) from e
            # Stash identity on the request for operator_identity()
            request.state.cf_identity = identity
            return
        else:
            # CF Access not configured server-side — allow but log
            log.warning(
                "Public host %s accessed but CF Access not configured. "
                "Set BT_CF_ACCESS_TEAM_DOMAIN + BT_CF_ACCESS_AUD to enforce.",
                bare_host,
            )
            return

    raise HTTPException(
        status_code=403,
        detail=f"Source not allowed (ip={real_ip}, host={bare_host})",
    )


def operator_identity(request: Request) -> str:
    # 1. Cloudflare Access identity (verified JWT)
    cf_id = getattr(request.state, "cf_identity", None)
    if cf_id and cf_id.email:
        return cf_id.email

    # 2. Tailscale Serve identity
    ts_login = request.headers.get("Tailscale-User-Login")
    ts_name = request.headers.get("Tailscale-User-Name")
    if ts_login:
        return ts_login
    if ts_name:
        return ts_name

    # 3. Local dev override
    override = request.headers.get("X-Operator")
    if override:
        return override

    # 4. Fallback for LAN access
    return f"lan:{request.client.host}" if request.client else "anonymous"
