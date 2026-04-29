import { Module } from '@nestjs/common';
import { ServiceManagementController } from './service-management.controller';
import { ServiceManagementService } from './service-management.service';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  controllers: [ServiceManagementController],
  providers: [ServiceManagementService],
})
export class ServiceManagementModule {}
