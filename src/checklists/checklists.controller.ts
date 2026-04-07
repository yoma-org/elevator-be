import { Controller, Get, Query } from '@nestjs/common';
import { ChecklistsService } from './checklists.service';

@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Get('template')
  async getPublicTemplate(@Query('equipmentType') equipmentType?: string) {
    const data = await this.checklistsService.findPublicTemplate(equipmentType);
    return { success: true, data };
  }
}
