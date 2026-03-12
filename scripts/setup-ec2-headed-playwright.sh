#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this script as your normal user, not as root."
  exit 1
fi

if [[ ! -f "/etc/debian_version" ]]; then
  echo "This script currently supports Debian/Ubuntu-based EC2 instances only."
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
ENV_EXAMPLE_FILE="${PROJECT_ROOT}/.env.example"
XRDP_STARTWM="/etc/xrdp/startwm.sh"
XRDP_STARTWM_BACKUP="/etc/xrdp/startwm.sh.codex-backup"

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    exit 1
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"

  if grep -q "^${key}=" "${file}"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

require_command sudo
require_command apt-get
require_command systemctl
require_command npm
require_command npx

cd "${PROJECT_ROOT}"

if [[ ! -f "${ENV_FILE}" ]]; then
  if [[ -f "${ENV_EXAMPLE_FILE}" ]]; then
    cp "${ENV_EXAMPLE_FILE}" "${ENV_FILE}"
  else
    touch "${ENV_FILE}"
  fi
fi

echo "Installing desktop and browser dependencies..."
sudo DEBIAN_FRONTEND=noninteractive apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  xfce4 \
  xfce4-goodies \
  xorgxrdp \
  xrdp \
  dbus-x11

echo "Configuring XRDP to start XFCE..."
printf '%s\n' "xfce4-session" > "${HOME}/.xsession"

if [[ -f "${XRDP_STARTWM}" ]] && [[ ! -f "${XRDP_STARTWM_BACKUP}" ]]; then
  sudo cp "${XRDP_STARTWM}" "${XRDP_STARTWM_BACKUP}"
fi

sudo tee "${XRDP_STARTWM}" >/dev/null <<'EOF'
#!/bin/sh
if [ -r /etc/profile ]; then
  . /etc/profile
fi
if [ -r "$HOME/.profile" ]; then
  . "$HOME/.profile"
fi
export DESKTOP_SESSION=xfce
export XDG_SESSION_DESKTOP=xfce
export XDG_CURRENT_DESKTOP=XFCE
exec startxfce4
EOF
sudo chmod +x "${XRDP_STARTWM}"

echo "Enabling XRDP service..."
sudo systemctl enable xrdp
sudo systemctl restart xrdp

echo "Ensuring project directory ownership for user $USER..."
sudo chown -R "${USER}:${USER}" "${PROJECT_ROOT}"

echo "Installing Node dependencies..."
npm install

echo "Installing Playwright Chromium with system dependencies..."
npx playwright install --with-deps chromium

echo "Updating .env for headed browser mode..."
set_env_value "HEADLESS" "false" "${ENV_FILE}"

mkdir -p "${PROJECT_ROOT}/session/prysm-profile"

cat <<EOF

Setup complete.

Next steps:
1. In your EC2 security group, allow TCP 3389 only from your IP, or SSH-tunnel it instead.
2. Connect to the instance over Remote Desktop.
3. Inside that desktop session, run:
   ${PROJECT_ROOT}/scripts/start-headed-service.sh

If you prefer SSH tunneling for RDP, run this on your laptop:
ssh -L 3389:localhost:3389 <your-user>@<your-ec2-host>

Then connect your RDP client to localhost:3389.
EOF
