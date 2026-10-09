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
  const userEmail = 'darshana@hoslift.com';
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

  const monthlyData = new Array(12).fill(0);
  const now = new Date();
  for (const d of pastDays) {
    const dayDate = new Date(d.date);
    const monthsDiff = (now.getFullYear() - dayDate.getFullYear()) * 12 + (now.getMonth() - dayDate.getMonth());
    if (monthsDiff >= 0 && monthsDiff < 12) {
      monthlyData[11 - monthsDiff] += d.count;
    }
  }

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
    username: USERNAME,
    userEmail,
    publicRepos,
    yearsJoined,
    totalCommits,
    totalPRs,
    totalIssues,
    totalStars,
    totalContributedTo,
    totalContributions,
    totalRange,
    currentStreak,
    currRange,
    longestStreak,
    longestRange,
    monthlyData,
  };
}

async function getCommitHabits() {
  const res = await fetch(`https://api.github.com/search/commits?q=author:${USERNAME}&sort=author-date&order=desc&per_page=100`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github.cloak-preview',
      'User-Agent': 'github-habits-analyzer',
    },
  });
  const data = await res.json();
  const dayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullDayNames = {
    Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
    Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday'
  };

  let morning = 0;
  let daytime = 0;
  let evening = 0;
  let night = 0;

  if (data.items && data.items.length > 0) {
    for (const item of data.items) {
      if (!item.commit || !item.commit.author || !item.commit.author.date) continue;
      const d = new Date(item.commit.author.date);
      const h = d.getHours();
      const dayName = dayNames[d.getDay()];
      dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;

      if (h >= 6 && h < 12) morning++;
      else if (h >= 12 && h < 18) daytime++;
      else if (h >= 18 && h < 24) evening++;
      else night++;
    }
  }

  let peakDayKey = 'Fri';
  let maxDayCount = -1;
  for (const [day, count] of Object.entries(dayCounts)) {
    if (count > maxDayCount) {
      maxDayCount = count;
      peakDayKey = day;
    }
  }

  const timeBuckets = { Morning: morning, Daytime: daytime, Evening: evening, Night: night };
  let peakTime = 'Daytime';
  let maxTimeCount = -1;
  for (const [bucket, count] of Object.entries(timeBuckets)) {
    if (count > maxTimeCount) {
      maxTimeCount = count;
      peakTime = bucket;
    }
  }

  return {
    morning,
    daytime,
    evening,
    night,
    dayCounts,
    peakDay: fullDayNames[peakDayKey] || 'Friday',
    peakTime,
  };
}

async function getLocStats() {
  const query = `
    query($login: String!) {
      user(login: $login) {
        pullRequests(first: 100) {
          nodes {
            additions
            deletions
          }
        }
        contributionsCollection {
          totalCommitContributions
          restrictedContributionsCount
          totalPullRequestContributions
          totalIssueContributions
          totalPullRequestReviewContributions
        }
      }
    }
  `;
  const data = await fetchGraphQL(query, { login: USERNAME });
  const prs = data.user.pullRequests.nodes;
  let totalAdd = 0;
  let totalDel = 0;
  prs.forEach(p => {
    totalAdd += p.additions;
    totalDel += p.deletions;
  });

  const coll = data.user.contributionsCollection;
  return {
    totalAdd,
    totalDel,
    commits: coll.totalCommitContributions + coll.restrictedContributionsCount,
    prs: coll.totalPullRequestContributions,
    issues: coll.totalIssueContributions,
    reviews: coll.totalPullRequestReviewContributions,
  };
}

// 1. Streak Stats SVG
function generateStreakSVG(stats) {
  const { totalContributions, totalRange, currentStreak, currRange, longestStreak, longestRange } = stats;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     style="isolation: isolate" viewBox="0 0 495 195" width="495px" height="195px" direction="ltr">
  <style>
    @keyframes currstreak { 0% { font-size: 3px; opacity: 0.2; } 80% { font-size: 34px; opacity: 1; } 100% { font-size: 28px; opacity: 1; } }
    @keyframes fadein { 0% { opacity: 0; } 100% { opacity: 1; } }
    .bg { fill: #0d1117; stroke: #0d1117; }
    .divider { stroke: #40c463; stroke-width: 1; }
    .num-main { fill: #ffffff; }
    .label-main { fill: #ffffff; }
    .label-sub { fill: #8b949e; }
    .streak-ring { stroke: #40c463; fill: none; stroke-width: 5; }
    .streak-fire { fill: #40c463; }
    .streak-label { fill: #40c463; }
    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
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

// 2. Stats Card SVG
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

// 3. Profile Details SVG
function generateProfileDetailsSVG(stats) {
  const { displayName, username, userEmail, publicRepos, yearsJoined, totalContributions, monthlyData } = stats;

  const chartX = 245;
  const chartY = 38;
  const chartW = 225;
  const chartH = 105;

  const maxVal = Math.max(...monthlyData, 10);
  const pts = monthlyData.map((val, idx) => {
    const x = chartX + (idx / (monthlyData.length - 1)) * chartW;
    const y = chartY + chartH - (val / maxVal) * chartH;
    return { x, y };
  });

  let pathD = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const mx = (prev.x + curr.x) / 2;
    pathD += ` C ${mx} ${prev.y}, ${mx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  const areaD = `${pathD} L ${chartX + chartW} ${chartY + chartH} L ${chartX} ${chartY + chartH} Z`;

  const contribText = totalContributions >= 1000 
    ? `${(totalContributions / 1000).toFixed(2)}k Contributions on GitHub`
    : `${totalContributions} Contributions on GitHub`;

  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: #0d1117; stroke: #30363d; }
    .header-name { font: 600 16px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #40c463; }
    .sub-item { font: 400 11.5px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    .icon { fill: #8b949e; }
    .chart-label { font: 400 10px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    .chart-line { stroke: #40c463; stroke-width: 2; fill: none; }
    .chart-area { fill: #40c463; fill-opacity: 0.25; }
    .axis { stroke: #30363d; stroke-width: 1; }

    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .header-name { fill: #238636; }
      .sub-item { fill: #586069; }
      .icon { fill: #586069; }
      .chart-label { fill: #586069; }
      .chart-line { stroke: #238636; }
      .chart-area { fill: #238636; fill-opacity: 0.2; }
      .axis { stroke: #e1e4e8; }
    }
  </style>

  <rect class="bg" x="0.5" y="0.5" width="494" height="194" rx="4.5" stroke-width="1"/>

  <text x="25" y="36" class="header-name">${username} (${displayName.slice(0, 15)}...)</text>

  <g transform="translate(25, 54)">
    <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
      <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
    <text x="22" y="11" class="sub-item">${contribText}</text>
  </g>

  <g transform="translate(25, 82)">
    <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
      <path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9Zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8ZM5 12.25v3.25a.25.25 0 0 0 .4.2l1.45-1.087a.25.25 0 0 1 .3 0L8.6 15.7a.25.25 0 0 0 .4-.2v-3.25a.25.25 0 0 0-.25-.25h-3.5a.25.25 0 0 0-.25.25Z"/>
    </svg>
    <text x="22" y="11" class="sub-item">${publicRepos} Public Repos</text>
  </g>

  <g transform="translate(25, 110)">
    <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
      <path fill-rule="evenodd" d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0ZM8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm.5 4.75a.75.75 0 0 0-1.5 0v3.5a.75.75 0 0 0 .471.696l2.5 1a.75.75 0 0 0 .557-1.392L8.5 7.742V4.75Z"/>
    </svg>
    <text x="22" y="11" class="sub-item">Joined GitHub ${yearsJoined} years ago</text>
  </g>

  <g transform="translate(25, 138)">
    <svg class="icon" viewBox="0 0 16 16" width="14" height="14">
      <path fill-rule="evenodd" d="M1.75 2A1.75 1.75 0 0 0 0 3.75v.736a.75.75 0 0 0 0 .027v7.737C0 13.216.784 14 1.75 14h12.5A1.75 1.75 0 0 0 16 12.25v-8.5A1.75 1.75 0 0 0 14.25 2H1.75ZM14.5 4.07v-.32a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25v.32L8 7.88l6.5-3.81Zm-13 1.74v6.441c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V5.809L8.38 9.397a.75.75 0 0 1-.76 0L1.5 5.809Z"/>
    </svg>
    <text x="22" y="11" class="sub-item">${userEmail}</text>
  </g>

  <text x="${chartX + chartW}" y="25" text-anchor="end" class="chart-label">contributions in the last year</text>
  <path class="chart-area" d="${areaD}"/>
  <path class="chart-line" d="${pathD}"/>
  <line class="axis" x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}"/>
  <text x="${chartX}" y="${chartY + chartH + 18}" class="chart-label">Oct</text>
  <text x="${chartX + chartW * 0.25}" y="${chartY + chartH + 18}" text-anchor="middle" class="chart-label">Jan</text>
  <text x="${chartX + chartW * 0.5}" y="${chartY + chartH + 18}" text-anchor="middle" class="chart-label">Apr</text>
  <text x="${chartX + chartW * 0.75}" y="${chartY + chartH + 18}" text-anchor="middle" class="chart-label">Jul</text>
  <text x="${chartX + chartW}" y="${chartY + chartH + 18}" text-anchor="end" class="chart-label">Oct</text>
</svg>`;
}

// 4. Productive Hours & Commit Habits SVG
function generateHabitsSVG(habits) {
  const { morning, daytime, evening, night, dayCounts, peakDay, peakTime } = habits;
  const total = morning + daytime + evening + night || 1;
  const mPct = Math.round((morning / total) * 100);
  const dPct = Math.round((daytime / total) * 100);
  const ePct = Math.round((evening / total) * 100);
  const nPct = Math.round((night / total) * 100);

  const barMaxW = 100;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxDayVal = Math.max(...Object.values(dayCounts), 1);

  const dayBarsSVG = days.map((day, idx) => {
    const val = dayCounts[day] || 0;
    const barH = Math.max(4, Math.round((val / maxDayVal) * 55));
    const x = 285 + idx * 26;
    const y = 125 - barH;
    return `
      <g>
        <rect x="${x}" y="${y}" width="14" height="${barH}" rx="3" class="bar-fill"/>
        <text x="${x + 7}" y="142" text-anchor="middle" class="chart-label">${day[0]}</text>
      </g>
    `;
  }).join('');

  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: #0d1117; stroke: #30363d; }
    .header { font: 600 16px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #40c463; }
    .label { font: 400 12px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    .val { font: 600 12px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #ffffff; }
    .bar-bg { fill: #21262d; rx: 3; }
    .bar-fill { fill: #40c463; }
    .divider { stroke: #30363d; stroke-width: 1; }
    .chart-label { font: 400 10.5px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    .badge { font: 600 11px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #40c463; }

    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .header { fill: #238636; }
      .label { fill: #586069; }
      .val { fill: #24292e; }
      .bar-bg { fill: #eaecef; }
      .bar-fill { fill: #238636; }
      .divider { stroke: #e1e4e8; }
      .chart-label { fill: #586069; }
      .badge { fill: #238636; }
    }
  </style>

  <rect class="bg" x="0.5" y="0.5" width="494" height="194" rx="4.5" stroke-width="1"/>
  <text x="25" y="34" class="header">⏰ Productive Hours &amp; Commit Habits</text>

  <g transform="translate(25, 52)">
    <text x="0" y="11" class="label">🌅 Morning (06-12h)</text>
    <rect x="130" y="2" width="${barMaxW}" height="10" class="bar-bg"/>
    <rect x="130" y="2" width="${Math.round((mPct / 100) * barMaxW)}" height="10" rx="3" class="bar-fill"/>
    <text x="240" y="11" class="val">${mPct}%</text>
  </g>

  <g transform="translate(25, 78)">
    <text x="0" y="11" class="label">☀️ Daytime (12-18h)</text>
    <rect x="130" y="2" width="${barMaxW}" height="10" class="bar-bg"/>
    <rect x="130" y="2" width="${Math.round((dPct / 100) * barMaxW)}" height="10" rx="3" class="bar-fill"/>
    <text x="240" y="11" class="val">${dPct}%</text>
  </g>

  <g transform="translate(25, 104)">
    <text x="0" y="11" class="label">🌇 Evening (18-24h)</text>
    <rect x="130" y="2" width="${barMaxW}" height="10" class="bar-bg"/>
    <rect x="130" y="2" width="${Math.round((ePct / 100) * barMaxW)}" height="10" rx="3" class="bar-fill"/>
    <text x="240" y="11" class="val">${ePct}%</text>
  </g>

  <g transform="translate(25, 130)">
    <text x="0" y="11" class="label">🌙 Night (00-06h)</text>
    <rect x="130" y="2" width="${barMaxW}" height="10" class="bar-bg"/>
    <rect x="130" y="2" width="${Math.round((nPct / 100) * barMaxW)}" height="10" rx="3" class="bar-fill"/>
    <text x="240" y="11" class="val">${nPct}%</text>
  </g>

  <line class="divider" x1="268" y1="46" x2="268" y2="168"/>

  <text x="285" y="58" class="chart-label">Day of Week Activity</text>
  ${dayBarsSVG}

  <g transform="translate(285, 166)">
    <text x="0" y="0" class="badge">⚡ Peak: ${peakDay} (${peakTime})</text>
  </g>
</svg>`;
}

// 5. Lines of Code & Contribution Breakdown SVG
function generateLocSVG(data) {
  const { totalAdd, totalDel, commits, prs, issues, reviews } = data;
  const totalContrib = commits + prs + issues + reviews || 1;

  const cPct = Math.round((commits / totalContrib) * 100);
  const prPct = Math.round((prs / totalContrib) * 100);
  const issPct = Math.round((issues / totalContrib) * 100);
  const revPct = Math.max(1, 100 - (cPct + prPct + issPct));

  const barW = 444;
  const cW = Math.round((cPct / 100) * barW);
  const prW = Math.round((prPct / 100) * barW);
  const issW = Math.round((issPct / 100) * barW);
  const revW = Math.max(0, barW - (cW + prW + issW));

  const formatK = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();

  return `<svg width="495" height="195" viewBox="0 0 495 195" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bg { fill: #0d1117; stroke: #30363d; }
    .header { font: 600 16px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #40c463; }
    .label { font: 400 11.5px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    .val { font: 600 12px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #ffffff; }
    .num-add { font: 700 18px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #3fb950; }
    .num-del { font: 700 18px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #f85149; }
    .num-tot { font: 700 18px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #ffffff; }
    .sub { font: 400 11px 'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif; fill: #8b949e; }
    .divider { stroke: #30363d; stroke-width: 1; }

    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .header { fill: #238636; }
      .label { fill: #586069; }
      .val { fill: #24292e; }
      .num-add { fill: #238636; }
      .num-del { fill: #cf222e; }
      .num-tot { fill: #24292e; }
      .sub { fill: #586069; }
      .divider { stroke: #e1e4e8; }
    }
  </style>

  <rect class="bg" x="0.5" y="0.5" width="494" height="194" rx="4.5" stroke-width="1"/>
  <text x="25" y="34" class="header">📈 Lines of Code &amp; Contribution Breakdown</text>

  <!-- Multi-segment Progress Bar -->
  <g transform="translate(25, 48)">
    <rect x="0" y="0" width="${cW}" height="10" rx="3" fill="#40c463"/>
    <rect x="${cW}" y="0" width="${prW}" height="10" fill="#58a6ff"/>
    <rect x="${cW + prW}" y="0" width="${issW}" height="10" fill="#d29922"/>
    <rect x="${cW + prW + issW}" y="0" width="${revW}" height="10" rx="3" fill="#bc8cff"/>
  </g>

  <!-- Legend -->
  <g transform="translate(25, 74)">
    <circle cx="5" cy="5" r="4" fill="#40c463"/>
    <text x="14" y="9" class="label">Commits: <tspan class="val">${commits.toLocaleString()}</tspan> (${cPct}%)</text>

    <circle cx="150" cy="5" r="4" fill="#58a6ff"/>
    <text x="159" y="9" class="label">PRs: <tspan class="val">${prs}</tspan> (${prPct}%)</text>

    <circle cx="255" cy="5" r="4" fill="#d29922"/>
    <text x="264" y="9" class="label">Issues: <tspan class="val">${issues}</tspan> (${issPct}%)</text>

    <circle cx="360" cy="5" r="4" fill="#bc8cff"/>
    <text x="369" y="9" class="label">Reviews: <tspan class="val">${reviews}</tspan> (${revPct}%)</text>
  </g>

  <line class="divider" x1="25" y1="96" x2="470" y2="96"/>

  <!-- LOC Stats: 3 Columns -->
  <g transform="translate(25, 115)">
    <text x="0" y="20" class="num-add">+${formatK(totalAdd)}</text>
    <text x="0" y="42" class="sub">Lines Added</text>
  </g>

  <g transform="translate(185, 115)">
    <text x="0" y="20" class="num-del">-${formatK(totalDel)}</text>
    <text x="0" y="42" class="sub">Lines Deleted</text>
  </g>

  <g transform="translate(335, 115)">
    <text x="0" y="20" class="num-tot">${formatK(totalAdd + totalDel)}</text>
    <text x="0" y="42" class="sub">Total Lines Modified</text>
  </g>
</svg>`;
}

async function main() {
  console.log('Fetching verified stats from GitHub API...');
  const stats = await getAllStats();
  console.log('Computed stats successfully.');

  console.log('Analyzing commit habits...');
  const habits = await getCommitHabits();
  console.log('Computed habits successfully.');

  console.log('Analyzing LOC stats...');
  const loc = await getLocStats();
  console.log('Computed LOC successfully.');

  fs.writeFileSync('github-streak.svg', generateStreakSVG(stats));
  console.log('Successfully generated github-streak.svg!');

  fs.writeFileSync('github-stats.svg', generateStatsSVG(stats));
  console.log('Successfully generated github-stats.svg!');

  fs.writeFileSync('profile-details.svg', generateProfileDetailsSVG(stats));
  console.log('Successfully generated profile-details.svg!');

  fs.writeFileSync('productive-hours.svg', generateHabitsSVG(habits));
  console.log('Successfully generated productive-hours.svg!');

  fs.writeFileSync('loc-stats.svg', generateLocSVG(loc));
  console.log('Successfully generated loc-stats.svg!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
