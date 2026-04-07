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
        equipmentType: type.name,
        code: type.code,
        category: type.category,
        isActive: type.isActive,
      }));
    }

    const { data: equipmentData, error: eqErr } = await this.supabase.client
      .from('equipment')
      .select('equipmentType')
      .order('equipmentType', { ascending: true });

    if (eqErr) throw eqErr;

    const unique = [...new Set((equipmentData ?? []).map((e: any) => e.equipmentType))];
    return unique.map((t) => ({ equipmentType: t }));
  }

  async getEquipmentByBuilding(buildingId: string, equipmentType?: string) {
    let query = this.supabase.client
      .from('equipment')
      .select('*, buildings(name), equipment_types(name, code, category)')
      .eq('buildingId', buildingId)
      .order('equipmentCode', { ascending: true });

    if (equipmentType) {
      query = query.eq('equipmentType', equipmentType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }
}
