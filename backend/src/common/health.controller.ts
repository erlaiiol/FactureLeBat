import { Controller, Get } from '@nestjs/common';
import { Public } from './decorators/public.decorator';

@Controller('health')
export class HealthController {
  // Deployment health checks (docker-compose, load balancers) have no
  // session — must stay reachable without a valid access-token cookie.
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
