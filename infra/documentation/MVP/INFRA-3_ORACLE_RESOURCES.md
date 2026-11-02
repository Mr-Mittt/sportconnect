# INFRA-3 · Oracle resources (what exists, and what it is called)

Names only, no secrets and no OCIDs (the console shows an OCID on each resource's page; the instance's own is at `curl -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/` on the box). Updated 2026-11-02 for the move to the A1 box (INFRA-12; the A1 column facts are from the A1 migration log and the owner); Claude cannot see the console, so a console-only fact below is as reported by the owner.

| Thing | Value |
|---|---|
| Region / availability domain | `ap-melbourne-1`, single AD-1 |
| Compartment | the tenancy (root) |
| Production box | display name `instance-20261102-0730`, Always Free `VM.Standard.A1.Flex` (Ampere Altra 3.0 GHz, 2 OCPU / 12 GB, arm64; shape as reported by the owner), Ubuntu 24.04.5, 96 GB boot volume, public IP `161.33.72.52`, login `ubuntu`, SSH alias `sc-a1`. Serving since the DNS switch of 2026-11-02. **Previous production box (x86 reference): `instance-20261027-2337`, `VM.Standard.E3.Flex` (2 OCPU / 12 GB, x86_64), public IP `207.211.144.208`, alias `sc-box`: no traffic since the switch, its backup timer disabled; to be stopped, then terminated after the soak (owner).** |
| Network | VCN from the wizard "Create VCN with Internet Connectivity" (`10.0.0.0/16`, public subnet `10.0.0.0/24`); ingress TCP 22, 80, 443; route `0.0.0.0/0` to the Internet Gateway |
| DNS (iNET, `ns1.inet.vn`) | `yoursport.vn` and `auth.yoursport.vn` A records to `161.33.72.52` (the A1 box), TTL 300 s; `www` CNAME of the apex |
| Backup bucket | `sportconnect-backups` (private, Object Storage); objects are `<UTC stamp>/<file>`; lifecycle rule `delete-after-7-days` |
| Dynamic group | `sportconnect-box`, rule `ANY {instance.id = '<A1 instance OCID>', instance.id = '<x86 instance OCID>'}` while both boxes exist; **remove the x86 OCID when that box is terminated; a rebuilt box has a new OCID, so update this rule** |
| Policies | `Allow dynamic-group sportconnect-box to manage objects in tenancy where target.bucket.name = 'sportconnect-backups'`; `Allow dynamic-group sportconnect-box to read buckets in tenancy`; `Allow service objectstorage-ap-melbourne-1 to manage object-family in tenancy` (lets the lifecycle rule delete) |
| Backup job | on the A1 box: systemd timer `sportconnect-backup.timer`, 19:00 UTC (02:00 Vietnam), env in `/etc/sportconnect/backup.env`; uploads with an instance principal (no key on the box). **The x86 box's timer is disabled** (a second writer would make a stale set the "newest") |
| Secrets on the box | root-owned `chmod 600` files in the `ubuntu` home (`~/.kc-admin-pw`, `~/.internal-secret`, `~/.cred-secret`, `~/.brevo-smtp-key`, `~/.brevo-smtp-user`); INFRA-14 moves them to OCI Vault |
| Retired | INFRA-12 sandbox (`130.162.197.195`) and the first rebuild box (`instance-20261027-1617`, `207.211.145.56`), both terminated per the owner |

Rebuild in one line: new instance, update the `sportconnect-box` rule with its OCID, follow the INFRA-12 runbook, restore the latest bucket set (the Keycloak restore reverts the master admin password and the credentials-client secret, so re-run `set-admin-pw.sh` and `set-credentials-client-secret.sh` afterwards), then switch DNS. The measured run is in `INFRA-3_ORACLE_REBUILD_LOG.md`.
