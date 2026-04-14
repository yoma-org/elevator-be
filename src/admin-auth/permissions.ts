/**
 * Server-side permission matrix — mirrors frontend-next/lib/permissions.ts
 */

export type AdminRole = 'operation' | 'mnt-manager' | 'pc-team' | 'commercial' | 'management';
export type PermissionAction = 'view' | 'approve' | 'comment' | 'review' | 'download';
export type ReportStatus = 'received' | 'active' | 'submitted' | 'pc-review' | 'comm-review' | 'invoice-ready' | 'closed';

const PERMISSIONS: Record<AdminRole, Partial<Record<ReportStatus, PermissionAction[]>>> = {
  operation: {
    received: ['view', 'approve'],
    active: ['view', 'comment'],
    submitted: ['view', 'comment'],
    'pc-review': ['view', 'comment'],
    'comm-review': ['view'],
    'invoice-ready': ['view', 'download'],
    closed: ['view'],
  },
  'mnt-manager': {
    active: ['view'],
    submitted: ['view'],
    'pc-review': ['view'],
    'comm-review': ['comment'],
    'invoice-ready': ['view'],
    closed: ['view'],
  },
  'pc-team': {
    'pc-review': ['review', 'approve', 'comment'],
    'comm-review': ['view'],
    'invoice-ready': ['view'],
    closed: ['view'],
  },
  commercial: {
    'comm-review': ['review', 'approve', 'comment'],
    'invoice-ready': ['view', 'approve', 'download'],
    closed: ['view'],
  },
  management: {
    received: ['view'],
    'pc-review': ['view'],
    'comm-review': ['view'],
    'invoice-ready': ['view'],
    closed: ['view'],
  },
};

export const NEXT_STATUS: Record<string, string> = {
  received: 'active',
  active: 'submitted',
  submitted: 'pc-review',
  'pc-review': 'comm-review',
  'comm-review': 'invoice-ready',
  'invoice-ready': 'closed',
};

export function can(role: string, status: string, action: PermissionAction): boolean {
  if (!Object.keys(PERMISSIONS).includes(role)) return false;
  return PERMISSIONS[role as AdminRole]?.[status as ReportStatus]?.includes(action) ?? false;
}

export function canView(role: string, status: string): boolean {
  if (!Object.keys(PERMISSIONS).includes(role)) return false;
  const actions = PERMISSIONS[role as AdminRole]?.[status as ReportStatus];
  return (actions?.length ?? 0) > 0;
}

/**
 * Return the full permission matrix for a role: { status → actions[] }.
 * Used by the login endpoint to ship permissions to the frontend.
 */
export function getRolePermissions(role: string): Partial<Record<ReportStatus, PermissionAction[]>> {
  if (!Object.keys(PERMISSIONS).includes(role)) return {};
  return PERMISSIONS[role as AdminRole] ?? {};
}

/**
 * Return the list of statuses a role has any access to.
 */
export function getVisibleStatuses(role: string): ReportStatus[] {
  if (!Object.keys(PERMISSIONS).includes(role)) return [];
  return Object.keys(PERMISSIONS[role as AdminRole] ?? {}) as ReportStatus[];
}
