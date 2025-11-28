# Cloud Run Dockerfile for the runner service
# Uses Node 20 slim image and ensures `license-checker` is available

FROM node:20-slim

# Install small system deps (unzip used by adm-zip for some archives,
# ca-certificates for HTTPS access). Keep image small.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates unzip git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Copy only package metadata first for an efficient build cache
COPY functions/package*.json ./functions/

# Install production deps in the functions folder
WORKDIR /workspace/functions
RUN npm ci --production

# Install license-checker globally so `npx license-checker` works predictably
RUN npm install -g license-checker

# Copy the full functions tree (including runner, analyzers, analyze.js)
COPY functions ./functions

# Expose the same port the runner listens on
ENV PORT=8080

# Run the runner service
WORKDIR /workspace/functions/runner
CMD ["node", "runner.js"]
FROM node:20-bullseye-slim

ARG SYFT_VERSION=0.93.0

# Install minimal system deps
RUN apt-get update && apt-get install -y curl ca-certificates tar gzip unzip && rm -rf /var/lib/apt/lists/*

# Install syft binary
RUN set -eux; \
  curl -sL "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_linux_amd64.tar.gz" \
    | tar -C /usr/local/bin -xz syft || true; \
  chmod +x /usr/local/bin/syft || true

WORKDIR /app
# Copy runner package.json and install dependencies. When building with
# repository root as the build context (recommended), this will pick up
# the runner package manifest under functions/runner.
COPY functions/runner/package*.json ./
RUN npm ci --production

# copy runner and analyzers into the image
COPY functions/runner/runner.js ./
COPY functions/analyzers ./analyzers

EXPOSE 8080
CMD ["node", "runner.js"]
