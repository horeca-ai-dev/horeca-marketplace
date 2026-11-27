#!/usr/bin/env bash
# next-version.sh <commit> — the release tag for a commit that just passed its production deploy (D5-A1).
# Run by the Deploy workflow's `release` job; works in any clone with full history and tags.
#
# Prints, in $GITHUB_OUTPUT format:   tag=vX.Y.Z   base=<previous tag, or empty for the first release>
# Prints NOTHING on stdout (exit 0) when there is nothing to release — the reason goes to stderr:
#   - the commit already carries a version tag (the same SHA deployed again)
#   - the commit is an ancestor of the newest release (a rollback redeploy is not a release)
#   - no feat / fix / breaking commit since the last release (docs, chore, ci, … alone)
#
# Rules — Conventional Commits since the newest vX.Y.Z tag that is an ancestor of <commit>:
#   breaking (`type!:` / `type(scope)!:` subject or a `BREAKING CHANGE:` footer)
#              → major; while the major is 0 → minor (v1.0.0 is cut by hand for the final demo)
#   feat       → minor
#   fix        → patch
#   no tag yet → v0.1.0
set -euo pipefail

die() {
  echo "next-version.sh: $*" >&2
  exit 2
}
note() { echo "next-version.sh: $*" >&2; }

[[ $# -eq 1 ]] || die "usage: next-version.sh <commit>"
sha="$(git rev-parse --verify --quiet "$1^{commit}")" || die "not a commit: $1"

readonly tag_re='^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'

# Every version tag, highest version first. Other tags are ignored.
mapfile -t tags < <(git tag --list 'v*' --sort=-version:refname | grep -E "$tag_re" || true)

if ((${#tags[@]} == 0)); then
  printf 'tag=v0.1.0\nbase=\n'
  exit 0
fi

if git tag --points-at "$sha" | grep -qE "$tag_re"; then
  note "$sha is already released ($(git tag --points-at "$sha" | grep -E "$tag_re" | head -n1)) — no new tag"
  exit 0
fi

newest="${tags[0]}"
if git merge-base --is-ancestor "$sha" "$newest"; then
  note "$sha is older than $newest (rollback) — no new tag"
  exit 0
fi

base=""
for t in "${tags[@]}"; do
  if git merge-base --is-ancestor "$t" "$sha"; then
    base="$t"
    break
  fi
done
[[ -n $base ]] || die "no version tag is an ancestor of $sha (history diverged?)"

breaking=false feat=false fix=false
while read -r commit; do
  subject="$(git show --no-patch --format=%s "$commit")"
  body="$(git show --no-patch --format=%b "$commit")"
  if [[ $subject =~ ^[a-z]+(\([^\)]*\))?!: ]] || grep -qE '^BREAKING[ -]CHANGE:' <<<"$body"; then
    breaking=true
  elif [[ $subject =~ ^feat(\([^\)]*\))?: ]]; then
    feat=true
  elif [[ $subject =~ ^fix(\([^\)]*\))?: ]]; then
    fix=true
  fi
done < <(git rev-list "$base..$sha")

[[ $base =~ $tag_re ]]
major="${BASH_REMATCH[1]}" minor="${BASH_REMATCH[2]}" patch="${BASH_REMATCH[3]}"

if [[ $breaking == true ]] && ((major > 0)); then
  next="v$((major + 1)).0.0"
elif [[ $breaking == true || $feat == true ]]; then
  next="v$major.$((minor + 1)).0"
elif [[ $fix == true ]]; then
  next="v$major.$minor.$((patch + 1))"
else
  note "no feat, fix or breaking commit since $base — no new tag"
  exit 0
fi

# Only possible when <commit> is not on the newest release's line; never reuse a tag.
if git rev-parse --verify --quiet "refs/tags/$next" >/dev/null; then
  note "$next already exists — no new tag"
  exit 0
fi

printf 'tag=%s\nbase=%s\n' "$next" "$base"
