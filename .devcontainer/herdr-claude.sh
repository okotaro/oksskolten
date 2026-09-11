#!/bin/bash
# Convenience wrapper for running Claude Code inside one of the .devcontainer/*
# variants from a bare host shell (e.g. as a herdr pane command), without
# needing VS Code or remembering the --config path for each variant.
#
# Usage: .devcontainer/herdr-claude.sh [default|C|Cs]
set -eu

variant="${1:-default}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workspace_folder="$(dirname "$script_dir")"
config_path="$script_dir/$variant/devcontainer.json"

if [ ! -f "$config_path" ]; then
    echo "Unknown variant: $variant (expected one of: default, C, Cs)" >&2
    exit 1
fi

devcontainer up --workspace-folder "$workspace_folder" --config "$config_path"

# The foreground process herdr sees on the host is `devcontainer`/`docker`
# (the exec wrapper), not `claude`, so herdr can't identify the agent by
# process name alone. HERDR_AGENT tells herdr which manifest to use instead.
export HERDR_AGENT=claude
exec devcontainer exec --workspace-folder "$workspace_folder" --config "$config_path" claude
