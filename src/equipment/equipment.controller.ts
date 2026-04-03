import { Controller, Get, Query } from '@nestjs/common';
import { EquipmentService } from './equipment.service';

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
    @Query('buildingId') buildingId: string,
    @Query('equipmentType') equipmentType?: string,
  ) {
    const data = await this.equipmentService.getEquipmentByBuilding(buildingId, equipmentType);
    return { success: true, data };
  }
}
