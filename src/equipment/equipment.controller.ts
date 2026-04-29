import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EquipmentService } from './equipment.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';

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

  @ApiBearerAuth('admin-jwt')
  @Patch(':id/type')
  @UseGuards(AdminAuthGuard)
  async updateType(@Param('id') id: string, @Body() body: { equipmentTypeId: string }) {
    const data = await this.equipmentService.updateEquipmentType(id, body.equipmentTypeId);
    return { success: true, equipment: data };
  }
}
