import { Controller, Get, Query } from '@nestjs/common';
import { ChecklistTemplate } from '../common/entities/checklist-template.entity';
import { ChecklistsService } from './checklists.service';

@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  private serializeTemplate(template: ChecklistTemplate | null) {
    if (!template) {
      return null;
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      categories: template.categories ?? [],
      isActive: template.isActive,
      equipmentType: template.equipmentType
        ? {
            id: template.equipmentType.id,
            name: template.equipmentType.name,
            code: template.equipmentType.code,
            category: template.equipmentType.category,
          }
        : null,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  @Get('template')
  async getPublicTemplate(@Query('equipmentType') equipmentType?: string) {
    const data = await this.checklistsService.findPublicTemplate(equipmentType);
    return { success: true, data: this.serializeTemplate(data) };
  }
}
