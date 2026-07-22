import { CustomerModel } from '../../../generated/prisma/models';

// Same indirection as CompanyProfile: the rest of the app depends on a
// domain name (CustomerProfile), not directly on Prisma's generated model.
export type CustomerProfile = CustomerModel;
