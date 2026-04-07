import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class ChecklistsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findPublicTemplate(equipmentTypeName?: string) {
    const normalizedName = equipmentTypeName?.trim().toLowerCase();
    if (!normalizedName) {
      return null;
    }

    const { data: eqType } = await this.supabase.client
      .from('equipment_types')
      .select('id, name, code, category')
      .ilike('name', normalizedName)
      .single();

    if (!eqType) return null;

    const { data: template } = await this.supabase.client
      .from('checklist_templates')
      .select('*')
      .eq('equipment_type_id', eqType.id)
      .eq('isActive', true)
      .order('updatedAt', { ascending: false })
      .limit(1)
      .single();

    if (!template) return null;

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      categories: template.categories ?? [],
      isActive: template.isActive,
      equipmentType: {
        id: eqType.id,
        name: eqType.name,
        code: eqType.code,
        category: eqType.category,
      },
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }
}
