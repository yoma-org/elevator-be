import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Building } from '../common/entities/building.entity';
import { Equipment } from '../common/entities/equipment.entity';
import { MaintenanceReport } from '../common/entities/maintenance-report.entity';
import { MaintenanceReportsController } from './maintenance-reports.controller';
import { MaintenanceReportsService } from './maintenance-reports.service';

@Module({
  imports: [TypeOrmModule.forFeature([MaintenanceReport, Building, Equipment])],
  controllers: [MaintenanceReportsController],
  providers: [MaintenanceReportsService],
})
export class MaintenanceReportsModule {}
