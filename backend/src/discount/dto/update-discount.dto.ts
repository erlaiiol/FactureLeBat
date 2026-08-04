import { CreateDiscountDto } from './create-discount.dto';

// Same shape as creation: PATCH is a full replace of the editable fields,
// not a partial patch (matches the Company/Product/Service PATCH convention).
export class UpdateDiscountDto extends CreateDiscountDto {}
