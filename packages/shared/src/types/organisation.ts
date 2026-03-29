export enum OrgRole {
  Owner = 'owner',
  Admin = 'admin',
  Billing = 'billing',
  Technical = 'technical',
}

export interface Organisation {
  id: string;
  customerId: string;
  name: string;
  stripeCustomerId?: string;
  createdAt: Date;
}

export interface OrgMembership {
  userId: string;
  orgId: string;
  role: OrgRole;
  invitedBy?: string;
  acceptedAt?: Date;
  createdAt: Date;
}

export interface OrgInvitation {
  id: string;
  orgId: string;
  email: string;
  role: OrgRole;
  token: string;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
}

/** Roles that can manage organisation members */
export const MEMBER_MANAGEMENT_ROLES: OrgRole[] = [OrgRole.Owner, OrgRole.Admin];

/** Roles that can manage billing */
export const BILLING_ROLES: OrgRole[] = [OrgRole.Owner, OrgRole.Admin, OrgRole.Billing];

/** Roles that can manage environments & activation codes */
export const TECHNICAL_ROLES: OrgRole[] = [OrgRole.Owner, OrgRole.Admin, OrgRole.Technical];

/** Roles that can view subscriptions */
export const SUBSCRIPTION_VIEW_ROLES: OrgRole[] = [
  OrgRole.Owner,
  OrgRole.Admin,
  OrgRole.Billing,
  OrgRole.Technical,
];
