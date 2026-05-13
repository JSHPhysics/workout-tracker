// Construct a "create new issue" URL on the project repo with the
// title, body, and labels prefilled. Used by the in-app fix-suggestion
// flows so a tap takes the user to a new tab with everything ready
// for one click of Submit.
//
// Single source of truth for the repo path: change here if the repo
// ever moves. The static GH-Pages client has no auth + no backend,
// so this is the only realistic way to "post" anything to GitHub —
// the *user* submits on our behalf via their own logged-in session.
//
// One-time setup on the repo (so the `labels` parameter has somewhere
// to land — GitHub silently drops unknown labels but the issue still
// gets created):
//
//   gh label create suggestion \
//     --description "Auto-filed exercise fix from the app" \
//     --color 0E8A16 --repo JSHPhysics/workout-tracker

const REPO = 'JSHPhysics/workout-tracker';

export interface IssueUrlOptions {
  title: string;
  body?: string;
  labels?: string[];
}

export function buildIssueUrl({ title, body, labels }: IssueUrlOptions): string {
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set('title', title);
  if (body !== undefined) url.searchParams.set('body', body);
  if (labels && labels.length > 0) {
    url.searchParams.set('labels', labels.join(','));
  }
  return url.toString();
}
