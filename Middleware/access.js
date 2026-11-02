const { ObjectId } = require('mongodb');
const { hr_roles_collection } = require('../Collection/all_collection');

// CEO and manager are always full admins. Everyone else gets pages from their role (or a personal override).
const ADMIN_DESIGNATIONS = ['Chief Executive Officer', 'manager'];

// Page keys are dashboard paths. These are what a plain employee has always been able to open.
const EMPLOYEE_PAGES = [
      '/dashboard/home', '/dashboard/attendance', '/dashboard/issue-submit', '/dashboard/notice', '/dashboard/your-task',
      '/dashboard/client_meetings', '/dashboard/meeting_management', '/dashboard/mail', '/dashboard/my-payslips', '/dashboard/account',
];

let seeded = false;
const ensure_roles = async () => {
      if (seeded) return;
      await hr_roles_collection.createIndex({ name: 1 }, { unique: true });
      await hr_roles_collection.updateOne({ name: 'Admin' }, { $setOnInsert: { name: 'Admin', permissions: ['*'], system: true, createdAt: new Date() } }, { upsert: true });
      await hr_roles_collection.updateOne({ name: 'Employee' }, { $setOnInsert: { name: 'Employee', permissions: EMPLOYEE_PAGES, system: true, createdAt: new Date() } }, { upsert: true });
      seeded = true;
};

const is_designation_admin = (user) => ADMIN_DESIGNATIONS.includes(user?.designation);

// { permissions: ['*'] | page keys, role: { _id, name } | null, source }
const effective = async (user) => {
      await ensure_roles();
      if (is_designation_admin(user)) return { permissions: ['*'], role: { name: 'Admin' }, source: 'designation' };
      const role = ObjectId.isValid(user?.roleId) ? await hr_roles_collection.findOne({ _id: new ObjectId(user.roleId) }) : await hr_roles_collection.findOne({ name: 'Employee' });
      if (Array.isArray(user?.permissions)) return { permissions: user.permissions, role: role ? { _id: role._id, name: role.name } : null, source: 'custom' };
      return { permissions: role?.permissions || EMPLOYEE_PAGES, role: role ? { _id: role._id, name: role.name } : null, source: 'role' };
};

const can = (permissions, key) => permissions.includes('*') || permissions.includes(key);

module.exports = { ADMIN_DESIGNATIONS, EMPLOYEE_PAGES, ensure_roles, effective, can, is_designation_admin };
