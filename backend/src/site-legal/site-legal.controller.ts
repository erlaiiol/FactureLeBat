import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SiteLegalService } from './site-legal.service';
import { SiteLegalInfo } from './entities/site-legal-info.entity';

// Mentions légales are, by law, public information — this route is read by
// both the unauthenticated /mentions-legales page and the admin "Infos
// légales" form (which reuses it for prefill instead of a second,
// duplicate read endpoint under /admin).
@Controller('site-legal')
export class SiteLegalController {
  constructor(private readonly siteLegalService: SiteLegalService) {}

  @Public()
  @Get()
  getInfo(): Promise<SiteLegalInfo> {
    return this.siteLegalService.getInfo();
  }
}
