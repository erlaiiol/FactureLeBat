import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SiteLegalInfo } from './entities/site-legal-info.entity';

// Fixed id for the one-and-only row — matches schema.prisma's @default on
// SiteLegalInfo.id, spelled out here too since upsert's `create` needs it
// explicitly.
export const SITE_LEGAL_INFO_ID = 'singleton';

function toEntity(row: {
  publisherName: string;
  siret: string;
  address: string;
  directorOfPublication: string;
  hostingProviderName: string;
  hostingProviderAddress: string;
  contactEmail: string;
}): SiteLegalInfo {
  return {
    publisherName: row.publisherName,
    siret: row.siret,
    address: row.address,
    directorOfPublication: row.directorOfPublication,
    hostingProviderName: row.hostingProviderName,
    hostingProviderAddress: row.hostingProviderAddress,
    contactEmail: row.contactEmail,
  };
}

const EMPTY_INFO: SiteLegalInfo = {
  publisherName: '',
  siret: '',
  address: '',
  directorOfPublication: '',
  hostingProviderName: '',
  hostingProviderAddress: '',
  contactEmail: '',
};

@Injectable()
export class SiteLegalRepository {
  constructor(private readonly prisma: PrismaService) {}

  // No row exists before the first admin save — an all-empty SiteLegalInfo
  // is a legitimate "not configured yet" state, not an error, so this never
  // throws.
  async get(): Promise<SiteLegalInfo> {
    const row = await this.prisma.siteLegalInfo.findUnique({ where: { id: SITE_LEGAL_INFO_ID } });
    return row ? toEntity(row) : EMPTY_INFO;
  }

  async update(patch: Partial<SiteLegalInfo>): Promise<SiteLegalInfo> {
    const current = await this.get();
    const next = { ...current, ...patch };
    const row = await this.prisma.siteLegalInfo.upsert({
      where: { id: SITE_LEGAL_INFO_ID },
      create: { id: SITE_LEGAL_INFO_ID, ...next },
      update: next,
    });
    return toEntity(row);
  }
}
