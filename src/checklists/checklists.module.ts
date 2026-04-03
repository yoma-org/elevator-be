import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChecklistTemplate } from '../common/entities/checklist-template.entity';
import { EquipmentType } from '../common/entities/equipment-type.entity';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChecklistTemplate, EquipmentType])],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
})
export class ChecklistsModule {}
