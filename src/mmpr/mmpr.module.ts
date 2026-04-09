import { Module } from '@nestjs/common';
import { MmprController } from './mmpr.controller';
import { MmprService } from './mmpr.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  controllers: [MmprController],
  providers: [MmprService],
})
export class MmprModule {}
