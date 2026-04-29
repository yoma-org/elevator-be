import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ServiceManagementService } from './service-management.service';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { CreateEquipmentTypeDto } from '../common/dto/create-equipment-type.dto';
import { UpdateChecklistTemplateDto } from '../common/dto/update-checklist-template.dto';

@ApiTags('service-management-admin')
@ApiBearerAuth('admin-jwt')
@Controller('admin/service-management')
@UseGuards(AdminAuthGuard)
export class ServiceManagementController {
  constructor(private readonly svc: ServiceManagementService) {}

  /** List all equipment types with checklist template summary. */
  @Get()
  async list() {
    const data = await this.svc.listWithSummary();
    return { success: true, data };
  }

  /** Create a new equipment type, optionally with an initial checklist template. */
  @Post()
  async create(@Body() body: CreateEquipmentTypeDto) {
    return this.svc.createEquipmentType(body);
  }

  /** Get the active checklist template for an equipment type. */
  @Get(':id/template')
  async getTemplate(@Param('id') id: string) {
    const data = await this.svc.getTemplateForType(id);
    return { success: true, data };
  }

  /** Upsert the checklist template for an equipment type. */
  @Patch(':id/template')
  async upsertTemplate(@Param('id') id: string, @Body() body: UpdateChecklistTemplateDto) {
    return this.svc.upsertTemplate(id, body);
  }
}
