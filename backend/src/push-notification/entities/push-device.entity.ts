import { PushPlatform } from '../../../generated/prisma/enums';

// One registered mobile-app install (Phase 22). Never includes anything
// beyond what an artisan or an admin legitimately needs to see — the raw
// FCM token itself is included since the admin "test push" action needs it
// to know which device it just targeted is confirmed correct, not a secret
// the way a refresh/auth token is.
export interface PushDeviceSummary {
  id: string;
  platform: PushPlatform;
  token: string;
  lastActiveAt: Date;
  createdAt: Date;
  userEmail: string;
  companyName: string;
}

export interface PushDeviceList {
  devices: PushDeviceSummary[];
  total: number;
  page: number;
  pageSize: number;
}
