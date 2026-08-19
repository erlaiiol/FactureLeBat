import { CreateCatalogFolderDto } from './create-catalog-folder.dto';

// Same shape as creation: PATCH is a full replace of the editable fields,
// not a partial patch (matches the Company/Product/Service/Discount PATCH
// convention).
export class UpdateCatalogFolderDto extends CreateCatalogFolderDto {}
