import { CreateServiceDto } from './create-service.dto';

// Same shape as creation: PATCH is a full replace of the editable fields,
// not a partial patch (matches the Company/Customer/Product PATCH convention).
export class UpdateServiceDto extends CreateServiceDto {}
