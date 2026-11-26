export const testAdminEmail = 'admin@example.test';
export const testResidentEmail = 'rezident@example.test';

export function localTestAccounts(env = process.env) {
  return ['development', 'test'].includes(env.NODE_ENV) && env.CAMIN_LOCAL_TEST_ACCOUNTS === 'true';
}

export function isTestAccount(email) {
  return email === testAdminEmail || email === testResidentEmail;
}

export function accountRole(account, testAccounts) {
  if (account.email === testAdminEmail ? testAccounts : account.can_view_service_status) return 'admin';
  return account.can_manage_equipment ? 'administrator' : 'resident';
}

// Each caller passes the local test toggle and the reserved addresses as query parameters.
export const adminAccountsSql = '((can_view_service_status AND email <> $2) OR ($1::boolean AND email = $2))';
export const operatorAccountsSql =
  `(${adminAccountsSql} OR (can_manage_equipment AND (email NOT IN ($2, $3) OR $1::boolean)))`;

export const roleQueryValues = testAccounts => [testAccounts, testAdminEmail, testResidentEmail];
