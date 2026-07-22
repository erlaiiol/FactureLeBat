import { ProductModel } from '../../../generated/prisma/models';

// Same indirection as CustomerProfile/CompanyProfile: the rest of the app
// depends on a domain name (ProductProfile), not directly on Prisma's
// generated model.
export type ProductProfile = ProductModel;
