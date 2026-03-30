export const SUPER_ADMINS = ['windalike5104@gmail.com', 'alan@pickup.system'];

/**
 * Helper to check if user is super admin
 */
export const isSuperAdmin = (email: string) => SUPER_ADMINS.includes(email.toLowerCase());
