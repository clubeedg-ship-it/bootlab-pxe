FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
ENV PNPM_IGNORE_BUILDS=true
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

EXPOSE 3000
CMD ["pnpm", "exec", "next", "dev", "-p", "3000", "-H", "0.0.0.0"]
