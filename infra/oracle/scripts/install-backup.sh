#!/usr/bin/env bash
# INFRA-3: install the nightly backup on the box. Run ON THE BOX as `ubuntu` (uses sudo), after run-containers.sh:
#
#   bash ~/sportconnect/infra/oracle/scripts/install-backup.sh
#
# What it does:
#   1. Installs the OCI CLI with pipx (Ubuntu 24.04 blocks `pip install` outside a virtualenv).
#   2. Creates /etc/sportconnect/backup.env from backup.env.example if it does not exist (you then set BACKUP_BUCKET).
#   3. Installs the systemd service and timer from infra/oracle/systemd/ and enables the timer.
# It does NOT start a backup: set BACKUP_BUCKET first, then run `sudo systemctl start sportconnect-backup`.
#
# Console work it cannot do (the runbook has the steps): the Object Storage bucket with a 7-day lifecycle rule, the dynamic
# group matching this instance, and the IAM policy that lets that group write to the bucket.
#
# Written for INFRA-3 on 2026-10-27. Only syntax-checked (`bash -n`) until the first run on the rebuilt box.
set -euo pipefail

ORACLE_DIR=${ORACLE_DIR:-$HOME/sportconnect/infra/oracle}

echo "== 1. OCI CLI"
if command -v oci > /dev/null 2>&1 || [ -x "$HOME/.local/bin/oci" ]; then
  echo "oci already installed: $("$HOME/.local/bin/oci" --version 2> /dev/null || oci --version)"
else
  sudo apt-get install -y pipx
  pipx install oci-cli
  echo "installed: $("$HOME/.local/bin/oci" --version)"
fi

echo "== 2. /etc/sportconnect/backup.env"
sudo mkdir -p /etc/sportconnect
if [ -f /etc/sportconnect/backup.env ]; then
  echo "exists, left as it is"
else
  sudo install -m 644 "$ORACLE_DIR/backup.env.example" /etc/sportconnect/backup.env
  echo "created from the example: edit it and set BACKUP_BUCKET"
fi

echo "== 3. systemd service and timer"
chmod +x "$ORACLE_DIR/scripts/backup-postgres.sh" "$ORACLE_DIR/scripts/restore-test.sh"
sudo install -m 644 "$ORACLE_DIR/systemd/sportconnect-backup.service" /etc/systemd/system/sportconnect-backup.service
sudo install -m 644 "$ORACLE_DIR/systemd/sportconnect-backup.timer" /etc/systemd/system/sportconnect-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now sportconnect-backup.timer
systemctl list-timers sportconnect-backup.timer --no-pager

echo "== done. Next: set BACKUP_BUCKET in /etc/sportconnect/backup.env, then: sudo systemctl start sportconnect-backup"
