import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ChecklistsService } from './checklists.service';

@ApiTags('checklists')
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Get('template')
  async getPublicTemplate(@Query('equipment_type') equipment_type?: string) {
    const data = await this.checklistsService.findPublicTemplate(equipment_type);
    return { success: true, data };
  }
}
