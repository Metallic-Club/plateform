#!/bin/sh
set -eu
# Canonical P1 reads environment variables; values stay out of image metadata and Compose config.
METALLIC_HMAC_KEY=$(cat /run/secrets/hmac_key)
METALLIC_DATA_KEY=$(cat /run/secrets/data_key)
METALLIC_SERVER_SECRET=$(cat /run/secrets/server_secret)
db_password=$(cat /run/secrets/db_password)
METALLIC_DATABASE_URL="postgres://metallic:${db_password}@db:5432/metallic?sslmode=disable"
export METALLIC_HMAC_KEY METALLIC_DATA_KEY METALLIC_SERVER_SECRET METALLIC_DATABASE_URL
unset db_password
exec /usr/local/bin/metallic-platform "$@"
