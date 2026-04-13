import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class EquipmentService {
  constructor(private readonly supabase: SupabaseService) {}

  async getBuildings() {
    const { data, error } = await this.supabase.client
      .from('buildings')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data;
  }

  async getEquipmentTypes() {
    const { data: managedTypes, error } = await this.supabase.client
      .from('equipment_types')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    if (managedTypes && managedTypes.length > 0) {
      return managedTypes.map((type: any) => ({
        id: type.id,
        equipment_type: type.name,
        code: type.code,
        category: type.category,
        is_active: type.is_active,
      }));
    }

    const { data: equipmentData, error: eqErr } = await this.supabase.client
      .from('equipment')
      .select('equipment_type')
      .order('equipment_type', { ascending: true });

    if (eqErr) throw eqErr;

    const unique = [...new Set((equipmentData ?? []).map((e: any) => e.equipment_type))];
    return unique.map((t) => ({ equipment_type: t }));
  }

  async getEquipmentByBuilding(building_id: string, equipment_type?: string) {
    let query = this.supabase.client
      .from('equipment')
      .select('*, buildings(name), equipment_types(name, code, category)')
      .eq('building_id', building_id)
      .order('equipment_code', { ascending: true });

    if (equipment_type) {
      query = query.eq('equipment_type', equipment_type);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }
}
