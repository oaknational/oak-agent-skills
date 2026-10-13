#!/usr/bin/env bash
# Installs a pinned command-line tool from its GitHub release and checks its SHA-256
# before running it. Dependabot can't update these pins, so update them by hand.
set -euo pipefail

tool="${1:?usage: install-tool.sh <gitleaks|actionlint|lychee>}"

case "$tool" in
  gitleaks)
    url="https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz"
    sha256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
    binary="gitleaks"
    ;;
  actionlint)
    url="https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz"
    sha256="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
    binary="actionlint"
    ;;
  lychee)
    url="https://github.com/lycheeverse/lychee/releases/download/lychee-v0.24.2/lychee-x86_64-unknown-linux-gnu.tar.gz"
    sha256="1f4e0ef7f6554a6ed33dd7ac144fb2e1bbed98598e7af973042fc5cd43951c9a"
    binary="lychee-x86_64-unknown-linux-gnu/lychee"
    ;;
  *)
    echo "Unknown tool: $tool" >&2
    exit 1
    ;;
esac

work="$(mktemp -d)"
bin="${RUNNER_TEMP:-$work}/bin"
mkdir -p "$bin"

curl --fail --silent --show-error --location --output "$work/tool.tar.gz" "$url"
echo "$sha256  $work/tool.tar.gz" | sha256sum --check --strict
tar -xzf "$work/tool.tar.gz" -C "$work"
install -m 0755 "$work/$binary" "$bin/$(basename "$binary")"

if [[ -n "${GITHUB_PATH:-}" ]]; then
  echo "$bin" >> "$GITHUB_PATH"
fi
