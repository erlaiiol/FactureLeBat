import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global(): every feature module can inject PrismaService without adding
// DatabaseModule to its own imports array. There is exactly one database
// in this app, so there is no scenario where a module should NOT have it.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
