import { CreateProductDto } from './create-product.dto';

// Same shape as creation: PATCH is a full replace of the editable fields,
// not a partial patch (matches the Company/Customer PATCH convention).
export class UpdateProductDto extends CreateProductDto {}
