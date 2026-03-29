export enum SubscriptionPlan {
  Monthly = 'monthly',
  Annual = 'annual',
}

export enum SubscriptionStatus {
  Active = 'active',
  Expired = 'expired',
  Cancelled = 'cancelled',
  PastDue = 'past_due',
}

export enum LicenceRecordType {
  Subscription = 'subscription',
  TimeLimited = 'time_limited',
  Unlimited = 'unlimited',
}

export interface Subscription {
  id: string;
  orgId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  createdAt: Date;
}

export interface LicenceRecord {
  id: string;
  orgId: string;
  type: LicenceRecordType;
  subscriptionId?: string;
  expiryDate?: Date;
  maxEnvironments: number;
  createdAt: Date;
}

export interface Environment {
  id: string;
  licenceId: string;
  environmentCode: string;
  name?: string;
  activatedAt?: Date;
  createdAt: Date;
}

export interface ActivationCodeRecord {
  id: string;
  environmentId: string;
  licenceId: string;
  licenceType: number;
  code: string;
  endDate?: Date;
  createdAt: Date;
}

/** API response consumed by {{PRODUCT_NAME}} Code App */
export interface SubscriptionStatusResponse {
  active: boolean;
  endDate?: string;
  error?: string;
}
