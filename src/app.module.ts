import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseService } from './common/supabase.service';
import { ChecklistsModule } from './checklists/checklists.module';
import { EquipmentModule } from './equipment/equipment.module';
import { MaintenanceReportsModule } from './maintenance-reports/maintenance-reports.module';
import { SuggestionsModule } from './suggestions/suggestions.module';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChecklistsModule,
    EquipmentModule,
    MaintenanceReportsModule,
    SuggestionsModule,
  ],
  controllers: [AppController],
  providers: [AppService, SupabaseService],
  exports: [SupabaseService],
})
export class AppModule {}
