import { DiscountModel } from '../../../generated/prisma/models';

// Same indirection as ProductProfile/ServiceProfile: the rest of the app
// depends on a domain name (DiscountProfile), not directly on Prisma's
// generated model.
export type DiscountProfile = DiscountModel;
