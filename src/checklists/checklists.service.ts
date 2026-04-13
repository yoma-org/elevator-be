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
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!template) return null;

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      categories: template.categories ?? [],
      is_active: template.is_active,
      equipment_type: {
        id: eqType.id,
        name: eqType.name,
        code: eqType.code,
        category: eqType.category,
      },
      created_at: template.created_at,
      updated_at: template.updated_at,
    };
  }
}
