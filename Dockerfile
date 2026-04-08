FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts
COPY . .
ARG DEVMODE=false
ENV DEVMODE=${DEVMODE}
RUN npm run build

# Compile native modules (better-sqlite3) in a stage that has build tools
FROM node:20-alpine AS api-deps
RUN apk add --no-cache python3 make g++
WORKDIR /api
COPY docker/package.json ./
RUN npm install --omit=dev --no-package-lock

FROM node:20-alpine
RUN apk add --no-cache nginx openssl

# Non-root operation.
# The whole container runs as the `node` user (UID 1000) shipped
# with the node:20-alpine image. nginx is configured to listen on
# port 8080 (>1024, so no CAP_NET_BIND_SERVICE needed) and writes
# its PID file, temp dirs, and access/error logs to locations the
# node user owns. See docker/nginx-main.conf for the rationale.
#
# Two files together describe the nginx setup:
#   /etc/nginx/nginx.conf            <- main config (this one)
#   /etc/nginx/http.d/default.conf   <- server block + security headers
COPY docker/nginx-main.conf /etc/nginx/nginx.conf
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# Static SPA files
COPY --from=build /app/dist /app/static

# API server
WORKDIR /app
COPY --from=api-deps /api/node_modules /app/node_modules
COPY docker/package.json /app/package.json
COPY docker/server.js /app/server.js
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Ownership + writable paths for the non-root runtime:
#   /data           the persistent project storage
#   /app            the API server's home (entrypoint writes /app/.env)
#   /tmp/nginx*     nginx temp / pid / cache dirs
# We pre-create the temp dirs so nginx doesn't have to mkdir them
# at runtime; alpine's nginx package does not, and a missing dir
# is a startup failure.
RUN mkdir -p /data /tmp/nginx-client-body /tmp/nginx-proxy \
             /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi && \
    chown -R node:node /data /app /tmp/nginx-client-body /tmp/nginx-proxy \
                       /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi

USER node

EXPOSE 8080

# Lightweight liveness check: hit the public /api/config endpoint
# via the in-container nginx on its non-privileged 8080 port.
# Avoids pulling in curl as a runtime dep; wget comes with busybox
# in alpine. Failure here makes `docker compose ps` show the
# container as unhealthy and lets orchestrators (compose, k8s, etc.)
# react.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/api/config || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
