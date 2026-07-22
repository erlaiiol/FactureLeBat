import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ProductRepository } from './product.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductProfile } from './entities/product.entity';

@Injectable()
export class ProductService {
  constructor(private readonly productRepository: ProductRepository) {}

  findAll(search?: string): Promise<ProductProfile[]> {
    return this.productRepository.findAll(search);
  }

  async findById(id: string): Promise<ProductProfile> {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async create(dto: CreateProductDto): Promise<ProductProfile> {
    try {
      return await this.productRepository.create(dto);
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  // Reports "not found" from the write itself rather than a separate
  // findById pre-check: a check-then-act pair leaves a window where a
  // concurrent request could remove the row between the two calls, turning
  // a legitimate 404 into an unhandled 500 from Prisma's own not-found
  // error (P2025). Catching it here closes that race and saves a round trip.
  async update(id: string, dto: UpdateProductDto): Promise<ProductProfile> {
    try {
      return await this.productRepository.update(id, dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Product ${id} not found`);
      }
      throw this.mapKnownError(error);
    }
  }

  // `code` is the first unique non-id field on this model — P2002 is Prisma's
  // generic unique-constraint-violation code, turned into a clean 409
  // instead of an unhandled 500 from the raw DB error.
  private mapKnownError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Ce code produit est déjà utilisé.');
    }
    return error;
  }
}
