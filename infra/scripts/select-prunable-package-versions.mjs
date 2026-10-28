// INFRA-4: which GHCR package versions the retention step may delete. Pure function of the API's version list, so it is
// testable without GitHub (infra/scripts/prune-ghcr-versions.sh does the fetching and deleting).
//
//   node select-prunable-package-versions.mjs <keep> < versions.json      # prints one version id per line
//
// Input: the package versions API output, as a JSON array or one JSON object per line.
// Rule: a version is a candidate only if it has tags and EVERY tag starts with `sha-` (an ordinary master build).
// Anything that carries a release tag (X.Y.Z), `latest`, `edge` or any other tag is never touched, and neither is an
// untagged version (it can be the manifest behind a tagged one). Of the candidates the newest <keep> are kept.
import { readFileSync } from 'node:fs'

const keep = Number.parseInt(process.argv[2] ?? '', 10)
if (!Number.isInteger(keep) || keep < 1) {
  console.error('usage: select-prunable-package-versions.mjs <keep >= 1> < versions.json')
  process.exit(1)
}

const text = readFileSync(0, 'utf8').trim()
let versions
try {
  const parsed = JSON.parse(text || '[]')
  versions = Array.isArray(parsed) ? parsed : [parsed]
} catch {
  versions = text.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

const tagsOf = (v) => v.metadata?.container?.tags ?? []
const candidates = versions
  .filter((v) => tagsOf(v).length > 0 && tagsOf(v).every((t) => t.startsWith('sha-')))
  .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

for (const v of candidates.slice(keep)) console.log(v.id)
