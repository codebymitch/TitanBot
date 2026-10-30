import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveReportsRepo, describeGitHubError } from '../src/services/reportIssueService.js';

describe('report issues repo', () => {
  test('defaults to 0skar11/DISbot when REPORTS_REPO is not set', () => {
    assert.equal(resolveReportsRepo(undefined), '0skar11/DISbot');
    assert.equal(resolveReportsRepo('  '), '0skar11/DISbot');
  });

  test('the old name 0skar11/- (now another repo) is sent to 0skar11/DISbot', () => {
    assert.equal(resolveReportsRepo('0skar11/-'), '0skar11/DISbot');
    assert.equal(resolveReportsRepo(' 0SKAR11/- '), '0skar11/DISbot');
  });

  test('any other repo set on the host is kept', () => {
    assert.equal(resolveReportsRepo('someone/reports'), 'someone/reports');
  });
});

describe('GitHub error log line', () => {
  const httpError = (status, message) => ({ response: { status, data: { message } } });

  test('404 names the repo and points at REPORTS_REPO and the token\'s repo access', () => {
    const line = describeGitHubError(httpError(404, 'Not Found'), '0skar11/-');
    assert.match(line, /HTTP 404 from 0skar11\/-: Not Found/u);
    assert.match(line, /REPORTS_REPO/u);
  });

  test('403 points at the Issues permission', () => {
    assert.match(describeGitHubError(httpError(403, 'Resource not accessible by personal access token'), '0skar11/DISbot'), /Issues: Read and write/u);
  });

  test('401 says the token is wrong or expired', () => {
    assert.match(describeGitHubError(httpError(401, 'Bad credentials'), '0skar11/DISbot'), /wrong or expired/u);
  });

  test('a network error without a response is still described', () => {
    const line = describeGitHubError(new Error('timeout of 15000ms exceeded'), '0skar11/DISbot');
    assert.match(line, /no response from 0skar11\/DISbot: timeout/u);
  });

  test('the log line never contains the token', () => {
    process.env.GITHUB_TOKEN = 'github_pat_test_value';
    const error = { message: 'boom', config: { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }, response: { status: 500, data: {} } };
    assert.doesNotMatch(describeGitHubError(error, '0skar11/DISbot'), /github_pat_test_value/u);
    delete process.env.GITHUB_TOKEN;
  });
});
