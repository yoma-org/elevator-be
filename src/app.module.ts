import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChecklistsModule } from './checklists/checklists.module';
import { Building } from './common/entities/building.entity';
import { ChecklistTemplate } from './common/entities/checklist-template.entity';
import { EquipmentType } from './common/entities/equipment-type.entity';
import { Equipment } from './common/entities/equipment.entity';
import { MaintenanceReport } from './common/entities/maintenance-report.entity';
import { EquipmentModule } from './equipment/equipment.module';
import { MaintenanceReportsModule } from './maintenance-reports/maintenance-reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: Number(configService.get<string>('DB_PORT', '5432')),
        username: configService.get<string>('DB_USER', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'maintenance_service_report'),
        schema: configService.get<string>('DB_SCHEMA', 'elevator'),
        entities: [Building, ChecklistTemplate, EquipmentType, Equipment, MaintenanceReport],
        synchronize: configService.get<string>('DB_SYNC', 'false') === 'true',
      }),
    }),
    ChecklistsModule,
    EquipmentModule,
    MaintenanceReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
