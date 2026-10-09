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
      'User-Agent': 'github-streak-generator',
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

async function getStreakData() {
  const userMeta = await fetchGraphQL(`
    query($login: String!) {
      user(login: $login) {
        createdAt
      }
    }
  `, { login: USERNAME });

  const createdAt = userMeta.user.createdAt;
  const startYear = new Date(createdAt).getFullYear();
  const currentYear = new Date().getFullYear();

  let allDays = [];
  let totalContributions = 0;

  for (let y = startYear; y <= currentYear; y++) {
    const from = `${y}-01-01T00:00:00Z`;
    const to = `${y}-12-31T23:59:59Z`;

    const calData = await fetchGraphQL(`
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
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
    `, { login: USERNAME, from, to });

    const cal = calData.user.contributionsCollection.contributionCalendar;
    totalContributions += cal.totalContributions;

    for (const week of cal.weeks) {
      for (const day of week.contributionDays) {
        allDays.push({ date: day.date, count: day.contributionCount });
      }
    }
  }

  // Deduplicate and sort by date ascending
  const uniqueDaysMap = new Map();
  allDays.forEach(d => uniqueDaysMap.set(d.date, d.count));
  const sortedDays = Array.from(uniqueDaysMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayStr = new Date().toISOString().slice(0, 10);
  const pastDays = sortedDays.filter(d => d.date <= todayStr);

  // Compute Longest Streak
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

  // Compute Current Streak
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
    totalContributions,
    totalRange,
    currentStreak,
    currRange,
    longestStreak,
    longestRange,
  };
}

function generateStreakSVG(stats) {
  const {
    totalContributions,
    totalRange,
    currentStreak,
    currRange,
    longestStreak,
    longestRange,
  } = stats;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     style="isolation: isolate" viewBox="0 0 495 195" width="495px" height="195px" direction="ltr">
  <style>
    @keyframes currstreak {
      0% { font-size: 3px; opacity: 0.2; }
      80% { font-size: 34px; opacity: 1; }
      100% { font-size: 28px; opacity: 1; }
    }
    @keyframes fadein {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }

    .bg { fill: #0d1117; stroke: #30363d; }
    .divider { stroke: #30363d; }
    .num-main { fill: #ffffff; }
    .label-main { fill: #ffffff; }
    .label-sub { fill: #8b949e; }
    .accent { stroke: #ffffff; fill: #ffffff; }

    @media (prefers-color-scheme: light) {
      .bg { fill: #ffffff; stroke: #e1e4e8; }
      .divider { stroke: #e1e4e8; }
      .num-main { fill: #000000; }
      .label-main { fill: #000000; }
      .label-sub { fill: #586069; }
      .accent { stroke: #000000; fill: #000000; }
    }
  </style>

  <defs>
    <clipPath id="outer_rectangle">
      <rect width="495" height="195" rx="10"/>
    </clipPath>
    <mask id="mask_out_ring_behind_fire">
      <rect width="495" height="195" fill="white"/>
      <ellipse id="mask-ellipse" cx="247.5" cy="32" rx="13" ry="18" fill="black"/>
    </mask>
  </defs>

  <g clip-path="url(#outer_rectangle)">
    <!-- Card Background -->
    <rect class="bg" stroke-width="1" rx="10" x="0.5" y="0.5" width="494" height="194"/>

    <!-- Vertical Column Dividers -->
    <line class="divider" x1="165" y1="28" x2="165" y2="170" stroke-width="1" stroke-linecap="round"/>
    <line class="divider" x1="330" y1="28" x2="330" y2="170" stroke-width="1" stroke-linecap="round"/>

    <!-- LEFT: Total Contributions -->
    <g transform="translate(82.5, 48)">
      <text x="0" y="32" text-anchor="middle" class="num-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="700" font-size="28px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.4s">
        ${totalContributions.toLocaleString()}
      </text>
    </g>
    <g transform="translate(82.5, 84)">
      <text x="0" y="32" text-anchor="middle" class="label-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="14px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.5s">
        Total Contributions
      </text>
    </g>
    <g transform="translate(82.5, 114)">
      <text x="0" y="32" text-anchor="middle" class="label-sub" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="12px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.6s">
        ${totalRange}
      </text>
    </g>

    <!-- CENTER: Current Streak -->
    <!-- Circular Ring -->
    <g mask="url(#mask_out_ring_behind_fire)">
      <circle cx="247.5" cy="71" r="40" fill="none" class="accent" stroke-width="5" style="opacity: 0; animation: fadein 0.5s linear forwards 0.4s"/>
    </g>

    <!-- Fire Icon -->
    <g transform="translate(247.5, 19.5)" style="opacity: 0; animation: fadein 0.5s linear forwards 0.5s">
      <path d="M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z" fill="none"/>
      <path class="accent" d="M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z"/>
    </g>

    <!-- Current Streak Big Number -->
    <g transform="translate(247.5, 48)">
      <text x="0" y="32" text-anchor="middle" class="num-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="700" font-size="28px" style="animation: currstreak 0.6s linear forwards">
        ${currentStreak}
      </text>
    </g>

    <!-- Current Streak Labels -->
    <g transform="translate(247.5, 108)">
      <text x="0" y="32" text-anchor="middle" class="label-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="700" font-size="14px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.7s">
        Current Streak
      </text>
    </g>
    <g transform="translate(247.5, 145)">
      <text x="0" y="21" text-anchor="middle" class="label-sub" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="12px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.8s">
        ${currRange}
      </text>
    </g>

    <!-- RIGHT: Longest Streak -->
    <g transform="translate(412.5, 48)">
      <text x="0" y="32" text-anchor="middle" class="num-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="700" font-size="28px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.8s">
        ${longestStreak}
      </text>
    </g>
    <g transform="translate(412.5, 84)">
      <text x="0" y="32" text-anchor="middle" class="label-main" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="14px" style="opacity: 0; animation: fadein 0.5s linear forwards 0.9s">
        Longest Streak
      </text>
    </g>
    <g transform="translate(412.5, 114)">
      <text x="0" y="32" text-anchor="middle" class="label-sub" font-family="'Segoe UI', -apple-system, BlinkMacSystemFont, Ubuntu, sans-serif" font-weight="400" font-size="12px" style="opacity: 0; animation: fadein 0.5s linear forwards 1.0s">
        ${longestRange}
      </text>
    </g>
  </g>
</svg>`;
}

async function main() {
  console.log('Calculating accurate streaks with private repo contributions...');
  const stats = await getStreakData();
  console.log('Computed stats:', stats);
  const svg = generateStreakSVG(stats);
  fs.writeFileSync('github-stats.svg', svg);
  console.log('Successfully generated github-stats.svg!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
