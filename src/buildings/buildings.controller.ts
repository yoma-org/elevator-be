import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BuildingsService } from './buildings.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { UpdateBuildingDto } from '../common/dto/update-building.dto';

@ApiTags('buildings-admin')
@ApiBearerAuth('admin-jwt')
@Controller('admin/buildings')
@UseGuards(AdminAuthGuard)
export class BuildingsController {
  constructor(private readonly svc: BuildingsService) {}

  /** List all buildings + equipment summary for the Building Management page */
  @Get()
  async list() {
    const data = await this.svc.listWithSummary();
    return { success: true, data };
  }

  /** Update name + team. */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateBuildingDto) {
    return this.svc.update(id, body);
  }

  /** Add new equipment to an existing building. Skips duplicates by (building_id, code). */
  @Post(':id/equipment')
  async addEquipment(
    @Param('id') id: string,
    @Body() body: { items: Array<{ code: string; equipmentTypeId: string }> },
  ) {
    return this.svc.addEquipment(id, body.items ?? []);
  }
}
