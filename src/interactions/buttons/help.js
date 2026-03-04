import {
  helpBackButton,
  helpBugReportButton,
  helpPaginationButton,
} from '../../handlers/helpButtons.js';

const paginationIds = [
  'help-page_first',
  'help-page_prev',
  'help-page_next',
  'help-page_last',
];

const paginationInteractions = paginationIds.map((name) => ({
  name,
  execute: helpPaginationButton.execute,
}));

export default [helpBackButton, helpBugReportButton, ...paginationInteractions];