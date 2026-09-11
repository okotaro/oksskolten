#!/bin/bash
# Writes LOCAL_FOLDER_NAME and COMPOSE_PROJECT_NAME to .env next to every compose.yml
# under .devcontainer/, so docker compose can resolve the ${LOCAL_FOLDER_NAME} volume
# mount (see compose.yml) and avoid container name collisions across projects.
#
# LOCAL_FOLDER_NAME keeps the original casing (used for the actual mount path).
# COMPOSE_PROJECT_NAME is sanitized to satisfy compose's project name rules:
# lowercase alphanumeric, hyphens, and underscores only, starting with a
# letter or number.
#
# Invoked from initializeCommand in each devcontainer.json.
set -eu

workspace_folder="$1"
folder_name="$(basename "$workspace_folder")"

# 1. Lowercase
# 2. Replace any character that isn't [a-z0-9_-] with '-'
# 3. Collapse consecutive '-' into one
# 4. Trim leading/trailing '-'
project_name="$(
    echo "$folder_name" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9_-]/-/g; s/-+/-/g; s/^-+//; s/-+$//'
)"

# If sanitization stripped everything, or the result starts with something
# that isn't a letter/number (e.g. leading '_'), fall back to a safe default.
if [ -z "$project_name" ] || ! echo "$project_name" | grep -Eq '^[a-z0-9]'; then
    project_name="devcontainer-project"
fi

for dir in "$workspace_folder"/.devcontainer/*/; do
    if [ -f "$dir/compose.yml" ]; then
        {
            echo "LOCAL_FOLDER_NAME=$folder_name"
            echo "COMPOSE_PROJECT_NAME=$project_name"
        } > "$dir/.env"
    fi
done
