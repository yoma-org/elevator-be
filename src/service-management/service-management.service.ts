import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { CreateEquipmentTypeDto } from '../common/dto/create-equipment-type.dto';
import {
  ChecklistCategoryDto,
  UpdateChecklistTemplateDto,
} from '../common/dto/update-checklist-template.dto';

interface ChecklistItem {
  no?: string;
  label: string;
}
interface ChecklistCategory {
  category: string;
  items: ChecklistItem[];
}

function normalizeCategories(input: ChecklistCategoryDto[] | undefined): ChecklistCategory[] {
  if (!input) return [];
  return input
    .map((c) => ({
      category: (c.category ?? '').trim(),
      items: (c.items ?? [])
        .map((it) => ({
          no: (it.no ?? '').trim() || undefined,
          label: (it.label ?? '').trim(),
        }))
        .filter((it) => it.label),
    }))
    .filter((c) => c.category);
}

@Injectable()
export class ServiceManagementService {
  constructor(private readonly supabase: SupabaseService) {}

  /** List all equipment types with template summary (categoryCount, itemCount). */
  async listWithSummary() {
    const supa = this.supabase.client;

    const [{ data: types, error: tErr }, { data: templates, error: cErr }] = await Promise.all([
      supa
        .from('equipment_types')
        .select('id, name, code, description, category, is_active')
        .order('name', { ascending: true }),
      supa
        .from('checklist_templates')
        .select('id, equipment_type_id, name, description, categories, is_active, updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false }),
    ]);

    if (tErr) throw new InternalServerErrorException(tErr.message);
    if (cErr) throw new InternalServerErrorException(cErr.message);

    // Latest active template per equipment_type_id
    const templateByType = new Map<string, any>();
    for (const t of templates ?? []) {
      const eid = (t as any).equipment_type_id as string;
      if (!templateByType.has(eid)) templateByType.set(eid, t);
    }

    return (types ?? []).map((t: any) => {
      const tpl = templateByType.get(t.id);
      const categories: ChecklistCategory[] = (tpl?.categories ?? []) as ChecklistCategory[];
      const itemCount = categories.reduce((acc, c) => acc + (c.items?.length ?? 0), 0);
      return {
        id: t.id,
        name: t.name,
        code: t.code,
        description: t.description,
        category: t.category,
        is_active: t.is_active,
        templateId: tpl?.id ?? null,
        templateName: tpl?.name ?? null,
        categoryCount: categories.length,
        itemCount,
      };
    });
  }

  /** Get the active template for an equipment type, or null if none exists. */
  async getTemplateForType(equipmentTypeId: string) {
    const supa = this.supabase.client;

    const { data: type } = await supa
      .from('equipment_types')
      .select('id, name')
      .eq('id', equipmentTypeId)
      .maybeSingle();
    if (!type) throw new NotFoundException('Equipment type not found');

    const { data: template } = await supa
      .from('checklist_templates')
      .select('id, equipment_type_id, name, description, categories, is_active, updated_at')
      .eq('equipment_type_id', equipmentTypeId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      equipmentType: type,
      template: template ?? null,
    };
  }

  /** Upsert template categories for an equipment type. Replaces JSONB on existing or inserts new. */
  async upsertTemplate(equipmentTypeId: string, body: UpdateChecklistTemplateDto) {
    const supa = this.supabase.client;

    const { data: type } = await supa
      .from('equipment_types')
      .select('id, name')
      .eq('id', equipmentTypeId)
      .maybeSingle();
    if (!type) throw new NotFoundException('Equipment type not found');

    const categories = normalizeCategories(body.categories);
    const name = (body.name ?? `${type.name} Service Sheet`).trim();
    const description = body.description?.trim() || null;

    const { data: existing } = await supa
      .from('checklist_templates')
      .select('id')
      .eq('equipment_type_id', equipmentTypeId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supa
        .from('checklist_templates')
        .update({
          name,
          description,
          categories,
          updated_at: new Date().toISOString(),
        })
        .eq('id', (existing as any).id)
        .select()
        .single();
      if (error) throw new InternalServerErrorException(error.message);
      return { success: true, template: data };
    }

    const { data, error } = await supa
      .from('checklist_templates')
      .insert({
        name,
        description,
        categories,
        equipment_type_id: equipmentTypeId,
        is_active: true,
      })
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return { success: true, template: data };
  }

  /** Create a new equipment type and (optionally) its initial checklist template in one shot. */
  async createEquipmentType(body: CreateEquipmentTypeDto) {
    const supa = this.supabase.client;

    const name = (body.name ?? '').trim();
    if (!name) throw new ConflictException('Equipment type name is required');

    const { data: dup } = await supa
      .from('equipment_types')
      .select('id')
      .ilike('name', name)
      .maybeSingle();
    if (dup) throw new ConflictException(`Equipment type "${name}" already exists`);

    const insertPayload: Record<string, unknown> = {
      name,
      code: body.code?.trim() || null,
      description: body.description?.trim() || null,
      category: body.category?.trim() || null,
      is_active: body.is_active ?? true,
    };

    const { data: type, error } = await supa
      .from('equipment_types')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw new InternalServerErrorException(error.message);

    const categories = normalizeCategories(body.categories);
    let template: any = null;
    if (categories.length > 0) {
      const { data: tpl, error: tErr } = await supa
        .from('checklist_templates')
        .insert({
          name: `${name} Service Sheet`,
          description: null,
          categories,
          equipment_type_id: (type as any).id,
          is_active: true,
        })
        .select()
        .single();
      if (tErr) throw new InternalServerErrorException(tErr.message);
      template = tpl;
    }

    return { success: true, equipmentType: type, template };
  }
}
