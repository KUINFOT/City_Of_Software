# Dependency management

## Inventory and monitoring

The backend and frontend each keep a committed npm lockfile. The Dependency
security GitHub Actions workflow runs on dependency changes, pull requests,
weekly on Monday, and on demand. It blocks high or critical production
vulnerabilities and publishes a 90-day CycloneDX SBOM artifact for each app.
Dependabot also opens weekly dependency-update pull requests.

## Remediation targets

| Severity | Target time to remediate |
| --- | --- |
| Critical | 7 days |
| High | 14 days |
| Moderate | 30 days |
| Low | 90 days |

If an update cannot be applied within the target, record the affected package,
advisory, exposure, compensating control, owner, and a review date in the pull
request or issue that tracks it. Review every dependency-update pull request
with the relevant tests before merging.

## Local checks

Run the following from each application directory before a release:

```sh
npm ci
npm audit --omit=dev --audit-level=high
```

The repository currently tracks two moderate upstream dependency issues which
do not have a compatible non-breaking fix: `qs` through Express 4 and `uuid`
through node-cron 3. Dependabot and the weekly audit retain visibility until a
compatible update is available or the application has been migrated.
