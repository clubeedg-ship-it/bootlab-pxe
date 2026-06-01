from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routes_api import router as api_router
from .routes_boot import router as boot_router
from .routes_stage import router as stage_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(
    title="bootlab-pxe",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.0\.\d+|100\.\d+\.\d+\.\d+).*",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(api_router)
app.include_router(boot_router, prefix="/api/v1")
app.include_router(stage_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "server": settings.pxe_server}
