from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="BT_")

    database_url: str = "postgresql+asyncpg://bootlab:changeme@postgres:5432/bootlab"
    redis_url: str = "redis://redis:6379/0"

    pxe_server: str = ""  # MUST be set via BT_PXE_SERVER env var
    pxe_http_port: int = 8085
    api_port: int = 8086

    # External FOG Project server (imaging). Empty => FOG profile chainload off.
    fog_server: str = ""  # e.g. 192.168.0.10 (the FOG appliance IP/host)

    lan_subnet: str = "192.168.0.0/24"

    boot_intent_ttl_minutes: int = 60
    require_tailscale: bool = False  # set True once verified

    # Cloudflare Access (Zero Trust) — set both to enable JWT verification
    # for requests coming via trusted public hostnames.
    cf_access_team_domain: str = ""   # e.g. omiximo.cloudflareaccess.com
    cf_access_aud: str = ""           # application AUD tag


settings = Settings()
