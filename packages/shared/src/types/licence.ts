// {{PRODUCT_NAME}} Licence Types — must match Dataverse picklist values exactly

export enum LicenceStatus {
  Trial = 100000000,
  Active = 100000001,
  Expired = 100000002,
}

export enum LicenceType {
  None = 100000000,
  TimeLimited = 100000001,
  Unlimited = 100000002,
  Subscription = 100000003,
}

export interface LicenceInfo {
  id: string;
  environmentFingerprint: string;
  environmentCode: string;
  deploymentDate: Date;
  licenceStatus: LicenceStatus;
  licenceType: LicenceType;
  activationDate?: Date;
  expiryDate?: Date;
  activationCode?: string;
  subscriptionId?: string;
  subscriptionEndDate?: Date;
  subscriptionActive?: boolean;
  isReadonly: boolean;
  readonlyReason:
    | 'integrity_failed'
    | 'trial_expired'
    | 'licence_expired'
    | 'subscription_expired'
    | null;
  trialDaysRemaining: number;
  expiryDaysRemaining: number;
}
