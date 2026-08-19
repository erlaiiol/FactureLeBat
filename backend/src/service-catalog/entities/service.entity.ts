import { ServiceModel } from '../../../generated/prisma/models';
import { CatalogFolderRef } from '../../catalog-folder/entities/catalog-folder.entity';

// Same indirection as ProductProfile/CustomerProfile: the rest of the app
// depends on a domain name (ServiceProfile), not directly on Prisma's
// generated model. Phase 1.1-2: folders is always included (see
// ServiceCatalogRepository).
export type ServiceProfile = ServiceModel & { folders: CatalogFolderRef[] };
