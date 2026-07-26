import { Injectable } from '@nestjs/common';
import { SiteLegalRepository } from './site-legal.repository';
import { SiteLegalInfo } from './entities/site-legal-info.entity';
import { UpdateSiteLegalInfoDto } from './dto/update-site-legal-info.dto';

@Injectable()
export class SiteLegalService {
  constructor(private readonly siteLegalRepository: SiteLegalRepository) {}

  getInfo(): Promise<SiteLegalInfo> {
    return this.siteLegalRepository.get();
  }

  updateInfo(dto: UpdateSiteLegalInfoDto): Promise<SiteLegalInfo> {
    return this.siteLegalRepository.update(dto);
  }
}
