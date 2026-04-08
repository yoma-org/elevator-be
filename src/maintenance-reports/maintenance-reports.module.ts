import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { MaintenanceReportsController } from './maintenance-reports.controller';
import { MaintenanceReportsService } from './maintenance-reports.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [MaintenanceReportsController],
  providers: [MaintenanceReportsService],
})
export class MaintenanceReportsModule {}
