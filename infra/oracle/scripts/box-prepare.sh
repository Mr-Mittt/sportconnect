#!/usr/bin/env bash
# INFRA-12 sandbox: prepare a fresh Ubuntu 24.04 instance (Oracle Cloud) to run the stack. Run ON THE BOX as the `ubuntu` user:
#
#   bash box-prepare.sh
#
# Written from the commands run on 2026-10-26 (setup log steps 13 to 15). Only syntax-checked (`bash -n`); it was NOT re-run
# end to end on a fresh box, so treat the first real run as a test.
#
# What it does:
#   1. Opens TCP 80 and 443 in Ubuntu's own firewall. Oracle's Ubuntu image REJECTs everything except SSH in iptables,
#      even when the VCN security list allows the port, so BOTH layers are needed. The rules go before the final REJECT.
#   2. Saves the rules so they survive a reboot (iptables-persistent).
#   3. Installs Docker Engine, the Compose plugin and buildx from Docker's official apt repository.
#
# NOT done here (console work): the VCN security list needs ingress rules for TCP 22, 80 and 443 from 0.0.0.0/0, and the
# public subnet's route table needs a 0.0.0.0/0 rule to the Internet Gateway (without it SSH times out).
set -euo pipefail

echo "== 1. firewall: 80 and 443 before the REJECT rule"
for port in 80 443; do
  rule=(-p tcp -m state --state NEW -m tcp --dport "$port" -j ACCEPT)
  if sudo iptables -C INPUT "${rule[@]}" 2>/dev/null; then
    echo "port $port already open"
  else
    # position 5 is just before the final REJECT of the stock Oracle ruleset; check with `sudo iptables -S INPUT`
    sudo iptables -I INPUT 5 "${rule[@]}"
    echo "port $port opened"
  fi
done

echo "== 2. persist the rules"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent >/dev/null
sudo netfilter-persistent save
sudo iptables -S INPUT

echo "== 3. Docker Engine and the Compose plugin"
if command -v docker >/dev/null 2>&1; then
  echo "docker already installed: $(docker --version)"
else
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl >/dev/null
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
  echo "docker installed; log out and back in (or use a new SSH session) before running docker without sudo"
fi
docker --version 2>/dev/null || sudo docker --version
docker compose version 2>/dev/null || sudo docker compose version
