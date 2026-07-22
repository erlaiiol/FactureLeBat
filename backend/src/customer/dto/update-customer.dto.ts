import { CreateCustomerDto } from './create-customer.dto';

// Same shape as creation: PATCH is a full replace of the editable fields,
// not a partial patch (matches the Company profile's PATCH convention).
export class UpdateCustomerDto extends CreateCustomerDto {}
