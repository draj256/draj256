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

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatFullDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 60) return `${Math.max(1, diffMin)}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

async function getAllStats() {
  const userQuery = `
    query($login: String!) {
      user(login: $login) {
        name
        createdAt
        pullRequests { totalCount }
        issues { totalCount }
        repositoriesContributedTo(first: 1) { totalCount }
        publicRepos: repositories(privacy: PUBLIC) { totalCount }
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
  const totalContributedTo = user.repositoriesContributedTo.totalCount;
  const publicRepos = user.publicRepos ? user.publicRepos.totalCount : 1;
  const totalStars = user.repositories.nodes.reduce((acc, repo) => acc + repo.stargazerCount, 0);

  const startYear = new Date(user.createdAt).getFullYear();
  const currentYear = new Date().getFullYear();
  const yearsJoined = Math.max(1, currentYear - startYear);

  let allDays = [];
  let totalContributions = 0;
  let totalCommits = 0;

  for (let y = startYear; y <= currentYear; y++) {
    const from = `${y}-01-01T00:00:00Z`;
    const to = `${y}-12-31T23:59:59Z`;

    const calQuery = `
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            restrictedContributionsCount
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
        }
      }
    `;

    const calData = await fetchGraphQL(calQuery, { login: USERNAME, from, to });
    const coll = calData.user.contributionsCollection;
    const cal = coll.contributionCalendar;

    totalContributions += cal.totalContributions;
    totalCommits += (coll.totalCommitContributions + coll.restrictedContributionsCount);

    for (const week of cal.weeks) {
      for (const day of week.contributionDays) {
        allDays.push({ date: day.date, count: day.contributionCount });
      }
    }
  }

  const uniqueDaysMap = new Map();
  allDays.forEach(d => uniqueDaysMap.set(d.date, d.count));
  const sortedDays = Array.from(uniqueDaysMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayStr = new Date().toISOString().slice(0, 10);
  const pastDays = sortedDays.filter(d => d.date <= todayStr);

  let longestStreak = 0;
  let longestStart = '';
  let longestEnd = '';
  let tempStreak = 0;
  let tempStart = '';

  for (let i = 0; i < pastDays.length; i++) {
    const day = pastDays[i];
    if (day.count > 0) {
      if (tempStreak === 0) tempStart = day.date;
      tempStreak++;
      if (tempStreak > longestStreak) {
        longestStreak = tempStreak;
        longestStart = tempStart;
        longestEnd = day.date;
      }
    } else {
      tempStreak = 0;
    }
  }

  let currentStreak = 0;
  let currentStart = '';
  let currentEnd = '';
  const n = pastDays.length;
  let lastIdx = n - 1;

  if (lastIdx >= 0 && pastDays[lastIdx].count === 0) {
    lastIdx--;
  }

  if (lastIdx >= 0 && pastDays[lastIdx].count > 0) {
    currentEnd = pastDays[lastIdx].date;
    while (lastIdx >= 0 && pastDays[lastIdx].count > 0) {
      currentStreak++;
      currentStart = pastDays[lastIdx].date;
      lastIdx--;
    }
  }

  const firstContribDay = pastDays.find(d => d.count > 0) || pastDays[0];
  const totalRange = `${formatFullDate(firstContribDay.date)} - Present`;

  const currRange = currentStreak > 0
    ? (currentStart === currentEnd ? formatDate(currentStart) : `${formatDate(currentStart)} - ${formatDate(currentEnd)}`)
    : 'No active streak';

  const longestRange = longestStreak > 0
    ? (longestStart === longestEnd ? formatDate(longestStart) : `${formatDate(longestStart)} - ${formatDate(longestEnd)}`)
    : 'None';

  return {
    displayName: user.name || USERNAME,
    totalCommits,
    totalPRs,
    totalIssues,
    totalStars,
    publicRepos,
    yearsJoined,
    totalContributedTo,
    totalContributions,
    totalRange,
    currentStreak,
    currRange,
    longestStreak,
    longestRange,
  };
}

// ⚡ Recent Events Fetcher
async function getRecentEvents() {
  try {
    const res = await fetch(`https://api.github.com/users/${USERNAME}/events?per_page=10`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'github-stats-generator',
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (!res.ok) return [];
    const events = await res.json();
    return Array.isArray(events) ? events : [];
  } catch (err) {
    console.error('Error fetching events:', err.message);
    return [];
  }
}

// ⚡ Recent Activity SVG Generator
function parseEvent(e) {
  const repo = e.repo?.name || 'repository';
  const type = e.type;
  const time = timeAgo(e.created_at);

  let title = '';
  let color = '#40c463';
  let iconPath = '';

  if (type === 'PushEvent') {
    title = `Pushed commits to <tspan font-weight="700">${repo}</tspan>`;
    color = '#40c463';
    iconPath = 'M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5h-3.32Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z';
  } else if (type === 'PullRequestEvent') {
    const act = e.payload?.action === 'closed' ? 'Merged' : 'Opened';
    title = `${act} pull request in <tspan font-weight="700">${repo}</tspan>`;
    color = '#bc8cff';
    iconPath = 'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.44 5.335A.75.75 0 0 0 10.5 4.805V3.75h1.75a3 3 0 0 1 3 3v4.378a2.25 2.25 0 1 1-1.5 0V6.75a1.5 1.5 0 0 0-1.5-1.5H10.5v1.055a.75.75 0 0 0 1.06.67l.178-.089a.75.75 0 0 0-.671-1.341l-.178.089V5.25a.75.75 0 0 0-.75-.75H10.5V3.44a.75.75 0 0 0-1.06-.67l-2.263 1.132a.75.75 0 0 0 0 1.341L9.44 6.375a.75.75 0 0 0 1.06-.67V4.5';
  } else if (type === 'CreateEvent') {
    const refType = e.payload?.ref_type || 'branch';
    title = `Created ${refType} in <tspan font-weight="700">${repo}</tspan>`;
    color = '#58a6ff';
    iconPath = 'M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z';
  } else if (type === 'IssuesEvent') {
    title = `Updated issue in <tspan font-weight="700">${repo}</tspan>`;
    color = '#d29922';
    iconPath = 'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z';
  } else if (type === 'WatchEvent') {
    title = `Starred <tspan font-weight="700">${repo}</tspan>`;
    color = '#e3b341';
    iconPath = 'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z';
  } else {
    title = `Activity in <tspan font-weight="700">${repo}</tspan>`;
    color = '#40c463';
    iconPath = 'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z';
  }

  return { title, color, time, iconPath };
}

function generateRecentActivitySVG(rawEvents) {
  const defaultEvents = [
    { type: 'PushEvent', repo: { name: 'hoslift/ranu.js' }, created_at: new Date().toISOString() },
    { type: 'CreateEvent', repo: { name: 'hoslift/ranu.js' }, payload: { ref_type: 'branch' }, created_at: new Date(Date.now() - 3600000 * 2).toISOString() },
    { type: 'PushEvent', repo: { name: 'draj256/draj256' }, created_at: new Date(Date.now() - 3600000 * 12).toISOString() },
    { type: 'PullRequestEvent', repo: { name: 'draj256/draj256' }, payload: { action: 'merged' }, created_at: new Date(Date.now() - 3600000 * 24).toISOString() },
  ];

  const eventsToUse = (rawEvents && rawEvents.length > 0) ? rawEvents.slice(0, 4) : defaultEvents;
  const parsed = eventsToUse.map(parseEvent);

  const itemsSVG = parsed.map((item, index) => {
    const y = 56 + index * 32;

    return `
    <g transform="translate(25, ${y})">
      <circle cx="10" cy="8" r="10" fill="${item.color}" fill-opacity="0.15"/>
      <g transform="translate(4, 2)">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="${item.color}">
          <path d="${item.iconPath}"/>
        </svg>
      </g>
      <text x="30" y="12" class="activity-text">${item.title}</text>
      <text x="445" y="12" text-anchor="end" class="activity-time">${item.time}</text>
    </g>`;
  }).join('');

  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: #0d1117; stroke: #30363d; }
    .header { font: 600 16px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #40c463; }
    .timeline-line { stroke: #30363d; stroke-width: 1.5; stroke-dasharray: 2 2; }
    .activity-text { font: 400 12px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #c9d1d9; }
    .activity-time { font: 400 11px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }

    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .header { fill: #238636; }
      .timeline-line { stroke: #e1e4e8; }
      .activity-text { fill: #24292e; }
      .activity-time { fill: #586069; }
    }
  </style>

  <rect class="bg" x="0.5" y="0.5" width="494" height="194" rx="4.5" stroke-width="1"/>
  <text x="25" y="34" class="header">⚡ Recent Activity Timeline</text>
  <line x1="35" y1="64" x2="35" y2="160" class="timeline-line"/>
  ${itemsSVG}
</svg>`;
}

// 🏆 Trophies Rank & SVG Generator
function getTrophyRank(type, val) {
  if (type === 'commits') {
    if (val >= 2000) return { rank: 'S', color: '#e3b341' };
    if (val >= 1000) return { rank: 'A+', color: '#e3b341' };
    if (val >= 500) return { rank: 'A', color: '#40c463' };
    return { rank: 'B', color: '#58a6ff' };
  }
  if (type === 'prs') {
    if (val >= 200) return { rank: 'S', color: '#e3b341' };
    if (val >= 100) return { rank: 'A+', color: '#e3b341' };
    if (val >= 50) return { rank: 'A', color: '#40c463' };
    return { rank: 'B', color: '#58a6ff' };
  }
  if (type === 'repos') {
    if (val >= 30) return { rank: 'S', color: '#e3b341' };
    if (val >= 15) return { rank: 'A+', color: '#e3b341' };
    if (val >= 5) return { rank: 'A', color: '#40c463' };
    return { rank: 'B', color: '#58a6ff' };
  }
  if (type === 'years') {
    if (val >= 5) return { rank: 'S', color: '#e3b341' };
    if (val >= 3) return { rank: 'A+', color: '#e3b341' };
    if (val >= 2) return { rank: 'A', color: '#40c463' };
    return { rank: 'B', color: '#58a6ff' };
  }
  if (type === 'issues') {
    if (val >= 100) return { rank: 'S', color: '#e3b341' };
    if (val >= 50) return { rank: 'A+', color: '#e3b341' };
    if (val >= 20) return { rank: 'A', color: '#40c463' };
    return { rank: 'B', color: '#58a6ff' };
  }
  if (type === 'stars') {
    if (val >= 50) return { rank: 'S', color: '#e3b341' };
    if (val >= 20) return { rank: 'A+', color: '#e3b341' };
    if (val >= 10) return { rank: 'A', color: '#40c463' };
    return { rank: 'B', color: '#58a6ff' };
  }
  return { rank: 'B', color: '#58a6ff' };
}

function generateTrophiesSVG(stats) {
  const { totalCommits, totalPRs, publicRepos, yearsJoined, totalIssues, totalStars } = stats;

  const trophies = [
    { name: 'Commits', ...getTrophyRank('commits', totalCommits), desc: totalCommits.toLocaleString() },
    { name: 'Pull Requests', ...getTrophyRank('prs', totalPRs), desc: totalPRs.toLocaleString() },
    { name: 'Repositories', ...getTrophyRank('repos', publicRepos), desc: `${publicRepos} Repos` },
    { name: 'Experience', ...getTrophyRank('years', yearsJoined), desc: `${yearsJoined} Years` },
    { name: 'Issues', ...getTrophyRank('issues', totalIssues), desc: totalIssues.toLocaleString() },
    { name: 'Stars', ...getTrophyRank('stars', totalStars), desc: `${totalStars} Stars` },
  ];

  const trophyItemsSVG = trophies.map((t, i) => {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const x = 25 + col * 151;
    const y = 52 + row * 62;

    return `
    <g transform="translate(${x}, ${y})">
      <rect width="143" height="54" rx="6" class="trophy-bg"/>
      <g transform="translate(8, 15)">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="${t.color}">
          <path d="M19 5h-2V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v2H5a3 3 0 0 0-3 3v1a5 5 0 0 0 4.14 4.93A6 6 0 0 0 11 15.9V19H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-3.1a6 6 0 0 0 4.86-2A5 5 0 0 0 22 9V8a3 3 0 0 0-3-3zM5 9V8a1 1 0 0 1 1-1h1v3.86A3 3 0 0 1 5 9zm14 0a3 3 0 0 1-2 1.86V7h1a1 1 0 0 1 1 1z"/>
        </svg>
      </g>
      <text x="36" y="21" class="trophy-title">${t.name}</text>
      <text x="36" y="39" class="trophy-desc">${t.desc}</text>
      <rect x="111" y="8" width="24" height="17" rx="3" fill="${t.color}" fill-opacity="0.15"/>
      <text x="123" y="20" text-anchor="middle" font-weight="700" font-size="10.5px" fill="${t.color}">${t.rank}</text>
    </g>`;
  }).join('');

  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: #0d1117; stroke: #30363d; }
    .header { font: 600 16px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #40c463; }
    .trophy-bg { fill: #161b22; stroke: #30363d; stroke-width: 1; }
    .trophy-title { font: 600 11px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #ffffff; }
    .trophy-desc { font: 400 11px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .header { fill: #238636; }
      .trophy-bg { fill: #f6f8fa; stroke: #d0d7de; }
      .trophy-title { fill: #24292e; }
      .trophy-desc { fill: #586069; }
    }
  </style>
  <rect class="bg" x="0.5" y="0.5" width="494" height="194" rx="4.5" stroke-width="1"/>
  <text x="25" y="34" class="header">🏆 GitHub Achievements &amp; Trophies</text>
  ${trophyItemsSVG}
</svg>`;
}

// 💻 Top Languages Data Fetcher & SVG Generator
async function getTopLanguages() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        repositories(first: 100, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], isFork: false) {
          nodes {
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  name
                  color
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await fetchGraphQL(query, { login: USERNAME });
    const repos = data.user.repositories.nodes || [];

    const langMap = new Map();

    for (const repo of repos) {
      if (!repo.languages || !repo.languages.edges) continue;
      for (const edge of repo.languages.edges) {
        const size = edge.size;
        const { name, color } = edge.node;

        if (langMap.has(name)) {
          const item = langMap.get(name);
          item.repos += 1;
          item.size += size;
        } else {
          langMap.set(name, { name, color: color || '#8b949e', repos: 1, size });
        }
      }
    }

    const sortedLangs = Array.from(langMap.values())
      .sort((a, b) => b.repos - a.repos || b.size - a.size)
      .slice(0, 6);

    const totalOccurrences = sortedLangs.reduce((sum, item) => sum + item.repos, 0);

    if (totalOccurrences === 0) {
      return [
        { name: 'TypeScript', color: '#3178c6', percentage: 31.4 },
        { name: 'JavaScript', color: '#f1e05a', percentage: 28.6 },
        { name: 'CSS', color: '#663399', percentage: 20.0 },
        { name: 'Dockerfile', color: '#384d54', percentage: 8.6 },
        { name: 'Dart', color: '#00B4AB', percentage: 5.7 },
        { name: 'PHP', color: '#4F5D95', percentage: 5.7 },
      ];
    }

    return sortedLangs.map(item => ({
      ...item,
      percentage: (item.repos / totalOccurrences) * 100,
    }));
  } catch (err) {
    return [
      { name: 'TypeScript', color: '#3178c6', percentage: 31.4 },
      { name: 'JavaScript', color: '#f1e05a', percentage: 28.6 },
      { name: 'CSS', color: '#663399', percentage: 20.0 },
      { name: 'Dockerfile', color: '#384d54', percentage: 8.6 },
      { name: 'Dart', color: '#00B4AB', percentage: 5.7 },
      { name: 'PHP', color: '#4F5D95', percentage: 5.7 },
    ];
  }
}

function generateTopLangsSVG(langs) {
  const displayLangs = (langs && langs.length > 0) ? langs.slice(0, 6) : [];

  const totalBarWidth = 445;
  let currentX = 0;
  const segmentsSVG = displayLangs.map((lang, index) => {
    const segW = Math.max(4, Math.round((lang.percentage / 100) * totalBarWidth));
    const w = (index === displayLangs.length - 1) ? Math.max(4, totalBarWidth - currentX) : segW;
    const res = `<rect x="${currentX}" y="0" width="${w}" height="8" fill="${lang.color || '#8b949e'}"/>`;
    currentX += w;
    return res;
  }).join('');

  const itemsSVG = displayLangs.map((lang, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = col === 0 ? 25 : 260;
    const y = 78 + row * 34;

    const miniBarW = 190;
    const fillW = Math.max(3, Math.round((lang.percentage / 100) * miniBarW));

    return `
    <g transform="translate(${x}, ${y})">
      <circle cx="5" cy="6" r="4.5" fill="${lang.color || '#8b949e'}"/>
      <text x="16" y="9" class="lang-name">${lang.name}</text>
      <text x="${miniBarW + 16}" y="9" text-anchor="end" class="lang-pct">${lang.percentage.toFixed(1)}%</text>
      <rect x="16" y="15" width="${miniBarW}" height="4" rx="2" class="bar-bg"/>
      <rect x="16" y="15" width="${fillW}" height="4" rx="2" fill="${lang.color || '#8b949e'}"/>
    </g>`;
  }).join('');

  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: #0d1117; stroke: #30363d; }
    .header { font: 600 16px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #40c463; }
    .lang-name { font: 600 12px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #ffffff; }
    .lang-pct { font: 400 11.5px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    .bar-bg { fill: #21262d; }
    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .header { fill: #238636; }
      .lang-name { fill: #24292e; }
      .lang-pct { fill: #586069; }
      .bar-bg { fill: #eaecef; }
    }
  </style>
  <rect class="bg" x="0.5" y="0.5" width="494" height="194" rx="4.5" stroke-width="1"/>
  <text x="25" y="34" class="header">💻 Most Used Languages</text>
  <g transform="translate(25, 48)">
    <rect width="${totalBarWidth}" height="8" rx="4" class="bar-bg"/>
    <g clip-path="url(#bar-clip)">
      ${segmentsSVG}
    </g>
  </g>
  <defs>
    <clipPath id="bar-clip">
      <rect width="${totalBarWidth}" height="8" rx="4"/>
    </clipPath>
  </defs>
  ${itemsSVG}
</svg>`;
}

// Option 1: Streak Stats SVG
function generateStreakSVG(stats) {
  const { totalContributions, totalRange, currentStreak, currRange, longestStreak, longestRange } = stats;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     style="isolation: isolate" viewBox="0 0 495 195" width="495px" height="195px" direction="ltr">
  <style>
    @keyframes currstreak { 0% { font-size: 3px; opacity: 0.2; } 80% { font-size: 34px; opacity: 1; } 100% { font-size: 28px; opacity: 1; } }
    @keyframes fadein { 0% { opacity: 0; } 100% { opacity: 1; } }
    .bg { fill: #0d1117; stroke: #30363d; stroke-width: 1; }
    .divider { stroke: #40c463; stroke-width: 1; }
    .num-main { fill: #ffffff; }
    .label-main { fill: #ffffff; }
    .label-sub { fill: #8b949e; }
    .streak-ring { stroke: #40c463; fill: none; stroke-width: 5; }
    .streak-fire { fill: #40c463; }
    .streak-label { fill: #40c463; }
    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; stroke-width: 1; }
      .divider { stroke: #238636; }
      .num-main { fill: #24292e; }
      .label-main { fill: #24292e; }
      .label-sub { fill: #586069; }
      .streak-ring { stroke: #238636; fill: none; }
      .streak-fire { fill: #238636; }
      .streak-label { fill: #238636; }
    }
  </style>
  <defs>
    <clipPath id="outer_rectangle"><rect width="495" height="195" rx="4.5"/></clipPath>
    <mask id="mask_out_ring_behind_fire"><rect width="495" height="195" fill="white"/><ellipse id="mask-ellipse" cx="247.5" cy="32" rx="13" ry="18" fill="black"/></mask>
  </defs>
  <g clip-path="url(#outer_rectangle)">
    <rect class="bg" rx="4.5" x="0.5" y="0.5" width="494" height="194"/>
    <line class="divider" x1="165" y1="28" x2="165" y2="170" vector-effect="non-scaling-stroke"/>
    <line class="divider" x1="330" y1="28" x2="330" y2="170" vector-effect="non-scaling-stroke"/>
    <g transform="translate(82.5, 48)"><text x="0" y="32" text-anchor="middle" class="num-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="700" font-size="28px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.4s">${totalContributions.toLocaleString()}</text></g>
    <g transform="translate(82.5, 84)"><text x="0" y="32" text-anchor="middle" class="label-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="14px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.5s">Total Contributions</text></g>
    <g transform="translate(82.5, 114)"><text x="0" y="32" text-anchor="middle" class="label-sub" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="12px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.6s">${totalRange}</text></g>
    <g mask="url(#mask_out_ring_behind_fire)"><circle cx="247.5" cy="71" r="40" class="streak-ring" style="opacity: 0; animation: fadein 0.5s linear forwards 0.4s"/></g>
    <g transform="translate(247.5, 19.5)" style="opacity: 0; animation: fadein 0.5s linear forwards 0.5s"><path d="M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z" fill="none"/><path class="streak-fire" d="M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z"/></g>
    <g transform="translate(247.5, 48)"><text x="0" y="32" text-anchor="middle" class="num-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="700" font-size="28px" style="animation: currstreak 0.6s linear forwards">${currentStreak}</text></g>
    <g transform="translate(247.5, 108)"><text x="0" y="32" text-anchor="middle" class="streak-label" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="700" font-size="14px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.7s">Current Streak</text></g>
    <g transform="translate(247.5, 145)"><text x="0" y="21" text-anchor="middle" class="label-sub" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="12px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.8s">${currRange}</text></g>
    <g transform="translate(412.5, 48)"><text x="0" y="32" text-anchor="middle" class="num-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="700" font-size="28px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.8s">${longestStreak}</text></g>
    <g transform="translate(412.5, 84)"><text x="0" y="32" text-anchor="middle" class="label-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="14px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.9s">Longest Streak</text></g>
    <g transform="translate(412.5, 114)"><text x="0" y="32" text-anchor="middle" class="label-sub" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="12px" style="opacity: 0; animation: fadein 0.5s linear forwards 1.0s">${longestRange}</text></g>
  </g>
</svg>`;
}

// Option 2: Stats Card SVG
function generateStatsSVG(stats) {
  const { displayName, totalCommits, totalPRs, totalIssues, totalStars, totalContributedTo } = stats;

  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: #0d1117; stroke: #30363d; }
    .header { font: 600 18px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #ffffff; }
    .stat-label { font: 400 13px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    .stat-value { font: 600 13px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #ffffff; }
    .icon { fill: #ffffff; }
    .rank-circle-bg { stroke: #30363d; stroke-width: 6; fill: none; }
    .rank-circle { stroke: #40c463; stroke-width: 6; fill: none; stroke-linecap: round; }
    .rank-text { font: 800 24px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #ffffff; }
    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .header { fill: #000000; }
      .stat-label { fill: #586069; }
      .stat-value { fill: #000000; }
      .icon { fill: #000000; }
      .rank-circle-bg { stroke: #e1e4e8; }
      .rank-circle { stroke: #238636; }
      .rank-text { fill: #000000; }
    }
  </style>
  <rect class="bg" x="0.5" y="0.5" width="494" height="194" rx="4.5" stroke-width="1"/>
  <text x="25" y="35" class="header">${displayName}'s GitHub Stats</text>
  <g transform="translate(25, 52)">
    <svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>
    <text x="28" y="13" class="stat-label">Total Stars Earned:</text>
    <text x="270" y="13" class="stat-value" text-anchor="end">${totalStars.toLocaleString()}</text>
  </g>
  <g transform="translate(25, 77)">
    <svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5h-3.32Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/></svg>
    <text x="28" y="13" class="stat-label">Total Commits (Public + Private):</text>
    <text x="270" y="13" class="stat-value" text-anchor="end">${totalCommits.toLocaleString()}</text>
  </g>
  <g transform="translate(25, 102)">
    <svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.44 5.335A.75.75 0 0 0 10.5 4.805V3.75h1.75a3 3 0 0 1 3 3v4.378a2.25 2.25 0 1 1-1.5 0V6.75a1.5 1.5 0 0 0-1.5-1.5H10.5v1.055a.75.75 0 0 0 1.06.67l.178-.089a.75.75 0 0 0-.671-1.341l-.178.089V5.25a.75.75 0 0 0-.75-.75H10.5V3.44a.75.75 0 0 0-1.06-.67l-2.263 1.132a.75.75 0 0 0 0 1.341L9.44 6.375a.75.75 0 0 0 1.06-.67V4.5"/></svg>
    <text x="28" y="13" class="stat-label">Total PRs:</text>
    <text x="270" y="13" class="stat-value" text-anchor="end">${totalPRs.toLocaleString()}</text>
  </g>
  <g transform="translate(25, 127)">
    <svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/></svg>
    <text x="28" y="13" class="stat-label">Total Issues:</text>
    <text x="270" y="13" class="stat-value" text-anchor="end">${totalIssues.toLocaleString()}</text>
  </g>
  <g transform="translate(25, 152)">
    <svg class="icon" viewBox="0 0 16 16" width="16" height="16"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25H12v2H5.25a.25.25 0 0 1-.25-.25Z"/></svg>
    <text x="28" y="13" class="stat-label">Contributed to:</text>
    <text x="270" y="13" class="stat-value" text-anchor="end">${totalContributedTo.toLocaleString()}</text>
  </g>
  <g transform="translate(395, 105)">
    <circle class="rank-circle-bg" cx="0" cy="0" r="42"/>
    <circle class="rank-circle" cx="0" cy="0" r="42" stroke-dasharray="264" stroke-dashoffset="35"/>
    <text class="rank-text" x="0" y="9" text-anchor="middle">A+</text>
  </g>
</svg>`;
}

async function main() {
  console.log('Fetching verified stats from GitHub API...');
  const stats = await getAllStats();
  console.log('Computed stats successfully.');

  console.log('Fetching top languages...');
  const langs = await getTopLanguages();

  console.log('Fetching recent activity events...');
  const events = await getRecentEvents();

  fs.writeFileSync('github-streak.svg', generateStreakSVG(stats));
  console.log('Successfully generated github-streak.svg!');

  fs.writeFileSync('github-stats.svg', generateStatsSVG(stats));
  console.log('Successfully generated github-stats.svg!');

  fs.writeFileSync('trophies.svg', generateTrophiesSVG(stats));
  console.log('Successfully generated trophies.svg!');

  fs.writeFileSync('top-langs.svg', generateTopLangsSVG(langs));
  console.log('Successfully generated top-langs.svg!');

  fs.writeFileSync('recent-activity.svg', generateRecentActivitySVG(events));
  console.log('Successfully generated recent-activity.svg!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
