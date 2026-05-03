#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/prod-common.sh"
cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "This folder is not a Git checkout. Clone from GitHub first to use automatic updates."
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  fail "Tracked files have local changes. Commit/stash them before updating production."
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
remote="${GIT_REMOTE:-origin}"

info "Fetching latest code from $remote/$branch"
git fetch "$remote" "$branch"

local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "$remote/$branch")"

if [[ "$local_sha" == "$remote_sha" ]]; then
  info "Already up to date"
  exit 0
fi

info "Updating production code"
git pull --ff-only "$remote" "$branch"

ensure_env
install_project_dependencies
build_project
start_production_app
wait_for_app

info "Production updated to $(git rev-parse --short HEAD)"
