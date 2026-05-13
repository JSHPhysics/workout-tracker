#!/usr/bin/env node
//
// Pull open `suggestion`-labelled issues from the project repo so we
// can review/approve them in batch. Pairs with the in-app
// "Open as GitHub issue" buttons (see SuggestExerciseFixModal /
// ExerciseReview / src/lib/githubIssueUrl.ts).
//
// Usage:
//   pnpm fix:pull            # human-readable list (default)
//   pnpm fix:pull --json     # combined JSON array, ready to paste
//                            # into the review tool's import flow
//
// Requires the GitHub CLI (`gh`) authenticated against an account
// with read access to the repo. We deliberately don't talk to the
// REST API directly — `gh` already handles auth, retries, and rate
// limiting, and the script stays under 100 lines.
//
// The script is read-only. Closing / labelling applied issues is a
// manual step for now (e.g. `gh issue close <num> --reason completed`)
// — automation can come later once the queue's volume justifies it.

import { execSync } from 'node:child_process';

const REPO = 'JSHPhysics/workout-tracker';
const LABEL = 'suggestion';

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');

let raw;
try {
  raw = execSync(
    `gh issue list --repo ${REPO} --label ${LABEL} --state open --json number,title,body,url --limit 200`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (err) {
  console.error(
    'Failed to query GitHub via `gh`. Check that it is installed and authenticated:',
  );
  console.error('  gh auth status');
  if (err.stderr) console.error(String(err.stderr));
  process.exit(1);
}

/** @type {{number: number, title: string, body: string, url: string}[]} */
const issues = JSON.parse(raw);

if (issues.length === 0) {
  if (asJson) {
    process.stdout.write('[]\n');
  } else {
    console.log('No open suggestion issues. Queue is clean.');
  }
  process.exit(0);
}

// Extract the JSON payload from a GitHub issue body. We expect a
// fenced ```json block (that's the format our in-app flow writes).
// Returns null when no fence is found or the contents don't parse.
function extractPayload(body) {
  const m = body.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

if (asJson) {
  // Concatenate every issue's payload into one flat array shaped like
  // the review tool's "Export changes" output. Issues whose body
  // doesn't contain a parseable JSON block are skipped with a warning
  // on stderr — the script's stdout has to stay valid JSON.
  const combined = [];
  for (const i of issues) {
    const payload = extractPayload(i.body);
    if (!payload) {
      console.error(`! Skipping #${i.number} — no parseable JSON block.`);
      continue;
    }
    if (Array.isArray(payload)) combined.push(...payload);
    else combined.push(payload);
  }
  process.stdout.write(JSON.stringify(combined, null, 2) + '\n');
  process.exit(0);
}

console.log(`Open suggestions on ${REPO}: ${issues.length}\n`);
for (const i of issues) {
  console.log(`--- #${i.number} — ${i.title}`);
  console.log(`    ${i.url}`);
  const payload = extractPayload(i.body);
  if (payload) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('(no parseable JSON block — raw body below)');
    console.log(i.body);
  }
  console.log('');
}
