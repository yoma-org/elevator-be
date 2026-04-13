import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EquipmentService } from './equipment.service';

@ApiTags('equipment')
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get('buildings')
  async getBuildings() {
    const data = await this.equipmentService.getBuildings();
    return { success: true, data };
  }

  @Get('types')
  async getTypes() {
    const data = await this.equipmentService.getEquipmentTypes();
    return { success: true, data };
  }

  @Get('by-building')
  async getByBuilding(
    @Query('building_id') building_id: string,
    @Query('equipment_type') equipment_type?: string,
  ) {
    const data = await this.equipmentService.getEquipmentByBuilding(building_id, equipment_type);
    return { success: true, data };
  }
}
