import { DiscountModel } from '../../../generated/prisma/models';
import { CatalogFolderRef } from '../../catalog-folder/entities/catalog-folder.entity';

// Same indirection as ProductProfile/ServiceProfile: the rest of the app
// depends on a domain name (DiscountProfile), not directly on Prisma's
// generated model. Phase 1.1-2: folders is always included (see
// DiscountRepository).
export type DiscountProfile = DiscountModel & { folders: CatalogFolderRef[] };
