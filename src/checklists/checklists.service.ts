import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChecklistTemplate, ChecklistTemplateCategory } from '../common/entities/checklist-template.entity';
import { EquipmentType } from '../common/entities/equipment-type.entity';

const DEFAULT_TEMPLATE_CATEGORIES: Record<string, ChecklistTemplateCategory[]> = {
  Elevator: [
    {
      category: 'Machine Room',
      items: ['General condition', 'Traction machine/motor', 'Control panel', 'Electromagnetic brake'],
    },
    {
      category: 'Car',
      items: ['Push buttons', 'Position indicator', 'Door interlock', 'Emergency light'],
    },
    {
      category: 'Hall',
      items: ['Hall buttons', 'Door operation', 'Guide shoes', 'General condition'],
    },
  ],
  Escalator: [
    {
      category: 'Operation',
      items: ['Operating conditions', 'Step and track condition', 'Handrail condition', 'Driving machine'],
    },
    {
      category: 'Safety',
      items: ['Emergency stop button', 'Safety switches', 'Fall prevention fence', 'Skirt guard'],
    },
  ],
  default: [
    {
      category: 'General',
      items: ['Overall operation', 'Safety devices', 'Door and panel condition', 'Abnormal noise/vibration'],
    },
  ],
};

@Injectable()
export class ChecklistsService implements OnModuleInit {
  constructor(
    @InjectRepository(ChecklistTemplate)
    private readonly checklistTemplateRepository: Repository<ChecklistTemplate>,
    @InjectRepository(EquipmentType)
    private readonly equipmentTypeRepository: Repository<EquipmentType>,
  ) {}

  async onModuleInit(): Promise<void> {
    const templateCount = await this.checklistTemplateRepository.count();
    if (templateCount > 0) {
      return;
    }

    const equipmentTypes = await this.equipmentTypeRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    if (equipmentTypes.length === 0) {
      return;
    }

    const defaults = equipmentTypes.map((equipmentType) => {
      const categories = this.cloneCategories(
        DEFAULT_TEMPLATE_CATEGORIES[equipmentType.name] ?? DEFAULT_TEMPLATE_CATEGORIES.default,
      );

      return this.checklistTemplateRepository.create({
        equipmentType,
        name: `${equipmentType.name} Standard Checklist`,
        description: `Baseline inspection template for ${equipmentType.name.toLowerCase()} maintenance visits.`,
        categories,
        isActive: true,
      });
    });

    await this.checklistTemplateRepository.save(defaults);
  }

  private cloneCategories(categories: ChecklistTemplateCategory[]) {
    return categories.map((group) => ({
      category: group.category.trim(),
      items: group.items.map((item) => item.trim()).filter(Boolean),
    }));
  }

  async findPublicTemplate(equipmentTypeName?: string): Promise<ChecklistTemplate | null> {
    const normalizedName = equipmentTypeName?.trim().toLowerCase();
    if (!normalizedName) {
      return null;
    }

    return this.checklistTemplateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.equipmentType', 'equipmentType')
      .where('template.isActive = :isActive', { isActive: true })
      .andWhere('LOWER(equipmentType.name) = :equipmentTypeName', {
        equipmentTypeName: normalizedName,
      })
      .orderBy('template.updatedAt', 'DESC')
      .getOne();
  }
}
