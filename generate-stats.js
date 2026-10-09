// generate-stats.js
const fs = require('fs');

const USERNAME = 'draj256';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('Error: GITHUB_TOKEN or GH_TOKEN is required.');
  process.exit(1);
}

async function fetchGraphQL(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'github-stats-generator',
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) {
    throw new Error(JSON.stringify(data.errors));
  }
  return data.data;
}

async function getStats() {
  // 1. Get User Profile and creation year
  const userQuery = `
    query($login: String!) {
      user(login: $login) {
        createdAt
        pullRequests { totalCount }
        issues { totalCount }
        repositories(first: 100, ownerAffiliations: OWNER) {
          nodes {
            stargazerCount
          }
        }
      }
    }
  `;
  const userData = await fetchGraphQL(userQuery, { login: USERNAME });
  const user = userData.user;

  const totalPRs = user.pullRequests.totalCount;
  const totalIssues = user.issues.totalCount;
  const totalStars = user.repositories.nodes.reduce((acc, repo) => acc + repo.stargazerCount, 0);

  // 2. Calculate All-time commits (Public + Private Restricted) by year
  const startYear = new Date(user.createdAt).getFullYear();
  const currentYear = new Date().getFullYear();

  let totalCommits = 0;

  for (let year = startYear; year <= currentYear; year++) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;

    const commitsQuery = `
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            restrictedContributionsCount
          }
        }
      }
    `;

    const yearData = await fetchGraphQL(commitsQuery, { login: USERNAME, from, to });
    const coll = yearData.user.contributionsCollection;
    // Public commits + Private restricted commits
    totalCommits += (coll.totalCommitContributions + coll.restrictedContributionsCount);
  }

  return { totalCommits, totalPRs, totalIssues, totalStars };
}

function generateSVG({ totalCommits, totalPRs, totalIssues, totalStars }) {
  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: #0d1117; stroke: #30363d; }
    .title { font: 600 18px 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; fill: #ffffff; }
    .label { font: 400 13px 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; fill: #8b949e; }
    .stat { font: 700 14px 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; fill: #ffffff; }
    .icon { fill: #ffffff; }

    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .title { fill: #000000; }
      .label { fill: #586069; }
      .stat { fill: #000000; }
      .icon { fill: #000000; }
    }
  </style>

  <rect class="bg" x="0.5" y="0.5" width="494" height="194" rx="10" stroke-width="1"/>
  
  <!-- Title -->
  <text x="30" y="38" class="title">${USERNAME}'s GitHub Stats</text>

  <!-- Total Commits (Public + Private) -->
  <g transform="translate(30, 60)">
    <text x="0" y="15" class="label">Total Commits (Public + Private):</text>
    <text x="430" y="15" text-anchor="end" class="stat">${totalCommits.toLocaleString()}</text>
  </g>

  <!-- Total Pull Requests -->
  <g transform="translate(30, 90)">
    <text x="0" y="15" class="label">Total PRs:</text>
    <text x="430" y="15" text-anchor="end" class="stat">${totalPRs.toLocaleString()}</text>
  </g>

  <!-- Total Issues -->
  <g transform="translate(30, 120)">
    <text x="0" y="15" class="label">Total Issues:</text>
    <text x="430" y="15" text-anchor="end" class="stat">${totalIssues.toLocaleString()}</text>
  </g>

  <!-- Total Stars Earned -->
  <g transform="translate(30, 150)">
    <text x="0" y="15" class="label">Total Stars Earned:</text>
    <text x="430" y="15" text-anchor="end" class="stat">${totalStars.toLocaleString()}</text>
  </g>
</svg>`;
}

async function main() {
  console.log('Fetching verified stats from GitHub API...');
  const stats = await getStats();
  console.log('Stats:', stats);
  const svg = generateSVG(stats);
  fs.writeFileSync('github-stats.svg', svg);
  console.log('Successfully generated github-stats.svg!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
