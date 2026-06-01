"""Cloudflare Access JWT verification.

When a request comes in via a Cloudflare-fronted domain, Cloudflare Access
authenticates the user (email OTP, SSO, YubiKey, etc.) and injects a signed
JWT in the `Cf-Access-Jwt-Assertion` header (and `CF_Authorization` cookie).

We verify the signature against Cloudflare's JWKS (public keys), check the
audience claim, and extract the user's identity.

Configuration via env vars (see config.py):
  BT_CF_ACCESS_TEAM_DOMAIN  e.g. omiximo.cloudflareaccess.com
  BT_CF_ACCESS_AUD          the application AUD tag from the CF dashboard

If either is unset, JWT verification is disabled and trusted public hostnames
fall through to network-only checks (insecure — only for initial setup).
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from .config import settings


@dataclass
class AccessIdentity:
    email: str
    sub: str
    raw_claims: dict[str, Any]


class _JWKSCache:
    """Caches Cloudflare's JWKS for the team domain.

    JWKS rarely change; refresh hourly. PyJWKClient already caches in-memory,
    we just keep a single client instance per process.
    """

    _client: PyJWKClient | None = None
    _ts: float = 0.0
    _ttl: float = 3600.0

    @classmethod
    def get(cls) -> PyJWKClient | None:
        if not settings.cf_access_team_domain:
            return None
        now = time.monotonic()
        if cls._client is None or (now - cls._ts) > cls._ttl:
            url = f"https://{settings.cf_access_team_domain}/cdn-cgi/access/certs"
            cls._client = PyJWKClient(url, cache_keys=True, lifespan=cls._ttl)
            cls._ts = now
        return cls._client


def is_configured() -> bool:
    return bool(settings.cf_access_team_domain and settings.cf_access_aud)


def verify(token: str) -> AccessIdentity:
    """Verify a CF Access JWT. Raises jwt exceptions on failure.

    Returns the identity (email + sub + raw claims) on success.
    """
    if not is_configured():
        raise RuntimeError("Cloudflare Access not configured")

    jwks = _JWKSCache.get()
    if jwks is None:
        raise RuntimeError("JWKS client unavailable")

    signing_key = jwks.get_signing_key_from_jwt(token).key

    claims = jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        audience=settings.cf_access_aud,
        issuer=f"https://{settings.cf_access_team_domain}",
        options={"require": ["exp", "iat", "iss", "aud", "sub"]},
    )

    email = claims.get("email") or claims.get("identity_nonce") or ""
    sub = claims.get("sub") or ""
    return AccessIdentity(email=email, sub=sub, raw_claims=claims)
