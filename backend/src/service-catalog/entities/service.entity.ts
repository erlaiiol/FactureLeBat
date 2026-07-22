import { ServiceModel } from '../../../generated/prisma/models';

// Same indirection as ProductProfile/CustomerProfile: the rest of the app
// depends on a domain name (ServiceProfile), not directly on Prisma's
// generated model.
export type ServiceProfile = ServiceModel;
