FROM python:3.12-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies before copying source so this layer is cached
COPY pyproject.toml ./
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy application source
COPY app/ ./app/

# Drop root
RUN useradd --no-create-home --shell /bin/false appuser
USER appuser

EXPOSE 8086

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8086"]
