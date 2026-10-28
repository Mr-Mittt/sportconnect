# INFRA-3 · Oracle resources (what exists, and what it is called)

Names only, no secrets and no OCIDs (the console shows an OCID on each resource's page; the instance's own is at `curl -H "Authorization: Bearer Oracle" http://169.254.169.254/opc/v2/instance/` on the box). Last checked 2026-10-28 from the rebuild log; Claude cannot see the console, so a console-only fact below is as reported by the owner.

| Thing | Value |
|---|---|
| Region / availability domain | `ap-melbourne-1`, single AD-1 |
| Compartment | the tenancy (root) |
| Production box | display name `instance-20261027-2337`, `VM.Standard.E3.Flex` (2 OCPU / 12 GB, x86_64), Ubuntu 24.04, 96 GB boot volume, public IP `207.211.144.208`, login `ubuntu` with the key kept outside the repo |
| Network | VCN from the wizard "Create VCN with Internet Connectivity" (`10.0.0.0/16`, public subnet `10.0.0.0/24`); ingress TCP 22, 80, 443; route `0.0.0.0/0` to the Internet Gateway |
| DNS (iNET, `ns1.inet.vn`) | `yoursport.vn` and `auth.yoursport.vn` A records to the public IP; `www` CNAME of the apex |
| Backup bucket | `sportconnect-backups` (private, Object Storage); objects are `<UTC stamp>/<file>`; lifecycle rule `delete-after-7-days` |
| Dynamic group | `sportconnect-box`, rule `ALL {instance.id = '<instance OCID>'}`; **a rebuilt box has a new OCID, so update this rule** |
| Policies | `Allow dynamic-group sportconnect-box to manage objects in tenancy where target.bucket.name = 'sportconnect-backups'`; `Allow dynamic-group sportconnect-box to read buckets in tenancy`; `Allow service objectstorage-ap-melbourne-1 to manage object-family in tenancy` (lets the lifecycle rule delete) |
| Backup job | systemd timer `sportconnect-backup.timer`, 19:00 UTC (02:00 Vietnam), env in `/etc/sportconnect/backup.env`; uploads with an instance principal (no key on the box) |
| Secrets on the box | root-owned `chmod 600` files in the `ubuntu` home (`~/.kc-admin-pw`, `~/.internal-secret`, `~/.cred-secret`, `~/.brevo-smtp-key`, `~/.brevo-smtp-user`); INFRA-14 moves them to OCI Vault |
| Retired | INFRA-12 sandbox (`130.162.197.195`) and the first rebuild box (`instance-20261027-1617`, `207.211.145.56`), both terminated per the owner |

Rebuild in one line: new instance, update the `sportconnect-box` rule with its OCID, follow the INFRA-12 runbook, restore the latest bucket set (the Keycloak restore reverts the master admin password and the credentials-client secret, so re-run `set-admin-pw.sh` and `set-credentials-client-secret.sh` afterwards), then switch DNS. The measured run is in `INFRA-3_ORACLE_REBUILD_LOG.md`.
