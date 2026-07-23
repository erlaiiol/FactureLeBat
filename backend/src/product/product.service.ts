import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { ProductRepository } from './product.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductProfile } from './entities/product.entity';

@Injectable()
export class ProductService {
  constructor(private readonly productRepository: ProductRepository) {}

  findAll(companyId: string, search?: string): Promise<ProductProfile[]> {
    return this.productRepository.findAll(companyId, search);
  }

  async findById(companyId: string, id: string): Promise<ProductProfile> {
    const product = await this.productRepository.findById(companyId, id);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async create(companyId: string, dto: CreateProductDto): Promise<ProductProfile> {
    try {
      return await this.productRepository.create(companyId, dto);
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  // Reports "not found"/"code already used" from the write itself rather
  // than a separate findById pre-check — same TOCTOU-avoidance reasoning as
  // before this retrofit, now via NoRowsAffectedError (see
  // ProductRepository.update) instead of Prisma's own P2025, which only
  // fires for .update()/.delete(), not the *Many variants a compound
  // {id, companyId} filter requires.
  async update(companyId: string, id: string, dto: UpdateProductDto): Promise<ProductProfile> {
    try {
      return await this.productRepository.update(companyId, id, dto);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`Product ${id} not found`);
      }
      throw this.mapKnownError(error);
    }
  }

  // `code` is unique per company (@@unique([companyId, code])) — P2002 is
  // Prisma's generic unique-constraint-violation code, turned into a clean
  // 409 instead of an unhandled 500 from the raw DB error.
  private mapKnownError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Ce code produit est déjà utilisé.');
    }
    return error;
  }
}
