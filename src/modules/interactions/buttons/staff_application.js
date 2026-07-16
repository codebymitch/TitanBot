import { confirmStaffApplication, rejectStaffApplication } from '../../../services/staffApplicationService.js';

export default { name: 'staff_application', async execute(interaction, client, args) {
  const [action, id] = args;
  if (action === 'confirm') return confirmStaffApplication(interaction, client, id);
  return rejectStaffApplication(interaction, client, id);
} };
