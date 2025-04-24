FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
COPY uv.lock .

RUN uv sync --frozen --no-cache

COPY . .

CMD ["uv", "run", "python", "outlook_email_responder.py"]
