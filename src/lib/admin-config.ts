/** Display name for the admin section; rename here only. */
export const ADMIN_AREA_NAME = "Chairs' Area";

export const ADMIN_NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/venues', label: 'Venues' },
  { href: '/admin/pending', label: 'Pending' },
  { href: '/admin/suggestions', label: 'Suggestions' },
  { href: '/admin/bribery', label: 'Bribery Record' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/account', label: 'Account' },
] as const;
