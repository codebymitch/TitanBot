import {
  helpBackButton,
  helpBugReportButton,
  helpPaginationButton,
} from '../../../handlers/help/helpButtons.js';
import type { ButtonHandler } from '../../../types/index.js';

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

export default [helpBackButton, helpBugReportButton, ...paginationInteractions] satisfies ButtonHandler[];
