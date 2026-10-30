import axios from 'axios';
import { logger } from '../utils/logger.js';

// Every report is also opened as an issue (label 'بلاغ') in the bot's GitHub repo, so reports can be
// searched and followed up there. Closing the issue marks the report as solved: the
// watcher below then edits the report message in Discord and pings the reporter with a
// short reply that deletes itself after 5 seconds.
//   GITHUB_TOKEN   fine-grained token with Issues read/write on REPORTS_REPO
//   REPORTS_REPO   owner/name of the repo the report issues go to
// The repo was renamed from 0skar11/- to 0skar11/DISbot; the old name now belongs to another repo,
// so a host still set up with REPORTS_REPO=0skar11/- (the old .env.example) is sent to DISbot too.
const DEFAULT_REPORTS_REPO = '0skar11/DISbot';
const OLD_REPORTS_REPO = '0skar11/-';

export function resolveReportsRepo(value) {
  const repo = String(value || '').trim();
  if (!repo) return DEFAULT_REPORTS_REPO;
  if (repo.toLowerCase() === OLD_REPORTS_REPO) {
    logger.warn(`REPORTS_REPO is still ${OLD_REPORTS_REPO} (the repo's old name): reports go to ${DEFAULT_REPORTS_REPO}. Update REPORTS_REPO on the host.`);
    return DEFAULT_REPORTS_REPO;
  }
  return repo;
}

const REPORTS_REPO = resolveReportsRepo(process.env.REPORTS_REPO);
const REPORT_LABEL = 'بلاغ';
const SOLVED_LABEL = 'اتحلت';
const CLOSED_LABEL = 'اتقفلت';
const SOLVED_COLOR = 0x2ecc71;
const CLOSED_COLOR = 0x95a5a6;
const WATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MENTION_DELETE_MS = 5_000;
const DISCORD_MARKER = /<!-- discord:(\d+)\/(\d+)\/(\d+)\/(\d+) -->/u;

function github() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return axios.create({
    baseURL: `https://api.github.com/repos/${REPORTS_REPO}`,
    timeout: 15_000,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

// One log line that says why GitHub refused: the HTTP status, the repo, and what to check on the host.
export function describeGitHubError(error, repo = REPORTS_REPO) {
  const status = error?.response?.status;
  const message = error?.response?.data?.message || error?.message || String(error);
  const hints = {
    401: 'GITHUB_TOKEN is wrong or expired',
    403: 'GITHUB_TOKEN lacks Issues: Read and write on this repo (or hit a rate limit)',
    404: 'the repo was not found or GITHUB_TOKEN has no access to it (check REPORTS_REPO and the token\'s repository list)',
    410: 'issues are turned off on this repo',
    422: 'GitHub rejected the issue fields',
  };
  const hint = hints[status] || (status ? 'unexpected GitHub response' : 'GitHub could not be reached');
  return `${status ? `HTTP ${status}` : 'no response'} from ${repo}: ${message} (${hint})`;
}

function oneLine(text, max) {
  const flat = String(text || '').replace(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// Opens the issue for a report already posted in Discord. Returns the issue number, or null.
export async function openReportIssue({ reportMessage, reporter, reportedUser, content, sourceChannel, attachmentUrls = [] }) {
  const api = github();
  if (!api) {
    logger.warn('GITHUB_TOKEN is not set: report was posted in Discord but not saved to GitHub.');
    return null;
  }

  const summary = oneLine(content, 70) || 'بدون نص';
  const lines = [
    `**المُبلِّغ:** ${reporter.tag} (\`${reporter.id}\`)`,
    reportedUser && `**المُبلَّغ عنه:** ${reportedUser.tag} (\`${reportedUser.id}\`)`,
    sourceChannel && `**الروم:** #${sourceChannel.name} (\`${sourceChannel.id}\`)`,
    `**الوقت:** ${new Date().toISOString()}`,
    `**الرسالة في ديسكورد:** ${reportMessage.url}`,
    '',
    '### المشكلة',
    content?.trim() || '*(بدون نص)*',
    attachmentUrls.length && '\n### المرفقات',
    ...attachmentUrls.map((url) => `- ${url}`),
    '',
    `<!-- discord:${reportMessage.guildId}/${reportMessage.channelId}/${reportMessage.id}/${reporter.id} -->`,
  ].filter((line) => typeof line === 'string');

  try {
    const { data } = await api.post('/issues', {
      title: `بلاغ من ${reporter.tag}: ${summary}`,
      body: lines.join('\n'),
      labels: [REPORT_LABEL],
    });
    return data.number;
  } catch (error) {
    logger.error(`Failed to open GitHub issue for report from ${reporter.tag}: ${describeGitHubError(error)}`);
    return null;
  }
}

async function notifyClosedReport(client, api, issue) {
  const marker = issue.body?.match(DISCORD_MARKER);
  const solved = issue.state_reason === 'completed';
  const label = solved ? SOLVED_LABEL : CLOSED_LABEL;

  if (marker) {
    const [, , channelId, messageId, reporterId] = marker;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    const reportMessage = channel?.isTextBased?.() ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (reportMessage) {
      const [embed] = reportMessage.embeds;
      await reportMessage.edit({
        embeds: [{
          ...embed?.toJSON?.(),
          color: solved ? SOLVED_COLOR : CLOSED_COLOR,
          title: solved ? `✅ بلاغ #${issue.number} — اتحلت` : `🔒 بلاغ #${issue.number} — اتقفل`,
        }],
      }).catch((error) => logger.error(`Failed to update report #${issue.number} in Discord:`, error));
      const mention = await reportMessage.reply({
        content: solved ? `<@${reporterId}> بلاغك #${issue.number} اتحل ✅` : `<@${reporterId}> بلاغك #${issue.number} اتقفل.`,
        allowedMentions: { users: [reporterId] },
      }).catch(() => null);
      if (mention) setTimeout(() => mention.delete().catch(() => null), MENTION_DELETE_MS);
    }
  }

  // The label marks the issue as handled so it isn't announced twice.
  await api.post(`/issues/${issue.number}/labels`, { labels: [label] });
  logger.info(`Report #${issue.number} closed on GitHub (${label}).`);
}

// Runs on a schedule: announces reports whose issue was closed since the last check.
export async function checkClosedReports(client) {
  const api = github();
  if (!api) return;

  const issues = await api.get('/issues', {
    params: {
      state: 'closed',
      labels: REPORT_LABEL,
      since: new Date(Date.now() - WATCH_WINDOW_MS).toISOString(),
      per_page: 50,
    },
  }).then(({ data }) => data, (error) => {
    logger.error(`Failed to check closed reports on GitHub: ${describeGitHubError(error)}`);
    return [];
  });

  for (const issue of issues) {
    if (issue.pull_request) continue;
    if (issue.labels.some((label) => [SOLVED_LABEL, CLOSED_LABEL].includes(label.name))) continue;
    await notifyClosedReport(client, api, issue).catch((error) => {
      logger.error(`Failed to handle closed report #${issue.number}:`, error.response?.data || error);
    });
  }
}
