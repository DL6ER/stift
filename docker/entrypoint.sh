#!/bin/sh
set -e

# Source /app/.env if an operator has mounted one. The container's
# normal configuration source is the docker-compose `environment:`
# block, but a mounted .env still works as an override mechanism
# for operators who prefer that pattern.
ENV_FILE="/app/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

# Ensure the project storage subdirectory exists. /data itself is
# already chowned to the node user at image build time and is
# normally a host volume mount.
mkdir -p /data/projects

# Start nginx in the background. Both the master and the workers
# run as the unprivileged `node` user (the container's USER), and
# nginx listens on the non-privileged port 8080. See
# docker/nginx-main.conf for the non-root setup details.
echo "Starting nginx..."
nginx

# Start the Node.js API server. exec replaces the shell with node
# so node becomes PID 1's child of tini (init: true in compose),
# which makes signal handling work cleanly. The server.js file has
# its own SIGTERM/SIGINT handlers for graceful shutdown.
echo "Starting Stift API server..."
exec node /app/server.js
