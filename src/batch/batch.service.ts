import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

interface BuildingRow {
  name: string;
  code?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
}

interface EquipmentRow {
  buildingName: string;
  equipment_type: string;
  equipment_code: string;
  serial_number?: string;
  brand?: string;
  model?: string;
  location?: string;
}

export interface BatchResult {
  row: number;
  status: 'created' | 'error';
  message: string;
  data?: any;
}

@Injectable()
export class BatchService {
  constructor(private readonly supabase: SupabaseService) {}

  async batchCreateBuildings(rows: BuildingRow[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.name?.trim()) {
          results.push({ row: i + 1, status: 'error', message: 'Building name is required' });
          continue;
        }

        // Check duplicate
        const { data: existing } = await this.supabase.client
          .from('buildings')
          .select('id')
          .ilike('name', row.name.trim())
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({ row: i + 1, status: 'error', message: `Building "${row.name}" already exists` });
          continue;
        }

        const { data, error } = await this.supabase.client
          .from('buildings')
          .insert({
            name: row.name.trim(),
            code: row.code?.trim() || null,
            address: row.address?.trim() || null,
            contact_name: row.contact_name?.trim() || null,
            contact_phone: row.contact_phone?.trim() || null,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          results.push({ row: i + 1, status: 'error', message: error.message });
        } else {
          results.push({ row: i + 1, status: 'created', message: `Building "${data.name}" created`, data });
        }
      } catch (err: any) {
        results.push({ row: i + 1, status: 'error', message: err.message ?? 'Unknown error' });
      }
    }

    return results;
  }

  async batchCreateEquipment(rows: EquipmentRow[]): Promise<BatchResult[]> {
    const results: BatchResult[] = [];

    // Pre-fetch buildings and equipment types for lookup
    const { data: buildings } = await this.supabase.client
      .from('buildings')
      .select('id, name');
    const buildingMap = new Map((buildings ?? []).map((b: any) => [b.name.toLowerCase(), b.id]));

    const { data: eqTypes } = await this.supabase.client
      .from('equipment_types')
      .select('id, name');
    const typeMap = new Map((eqTypes ?? []).map((t: any) => [t.name.toLowerCase(), t.id]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.buildingName?.trim()) {
          results.push({ row: i + 1, status: 'error', message: 'Building name is required' });
          continue;
        }
        if (!row.equipment_type?.trim()) {
          results.push({ row: i + 1, status: 'error', message: 'Equipment type is required' });
          continue;
        }
        if (!row.equipment_code?.trim()) {
          results.push({ row: i + 1, status: 'error', message: 'Equipment code is required' });
          continue;
        }

        const building_id = buildingMap.get(row.buildingName.trim().toLowerCase());
        if (!building_id) {
          results.push({ row: i + 1, status: 'error', message: `Building "${row.buildingName}" not found` });
          continue;
        }

        const typeId = typeMap.get(row.equipment_type.trim().toLowerCase()) ?? null;

        // Check duplicate equipment code in same building
        const { data: existing } = await this.supabase.client
          .from('equipment')
          .select('id')
          .eq('building_id', building_id)
          .eq('equipment_code', row.equipment_code.trim())
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({ row: i + 1, status: 'error', message: `Equipment "${row.equipment_code}" already exists in this building` });
          continue;
        }

        const { data, error } = await this.supabase.client
          .from('equipment')
          .insert({
            building_id,
            equipment_type: row.equipment_type.trim(),
            equipment_type_id: typeId,
            equipment_code: row.equipment_code.trim(),
            serial_number: row.serial_number?.trim() || null,
            brand: row.brand?.trim() || null,
            model: row.model?.trim() || null,
            location: row.location?.trim() || null,
            is_active: true,
          })
          .select()
          .single();

        if (error) {
          results.push({ row: i + 1, status: 'error', message: error.message });
        } else {
          results.push({ row: i + 1, status: 'created', message: `Equipment "${data.equipment_code}" created`, data });
        }
      } catch (err: any) {
        results.push({ row: i + 1, status: 'error', message: err.message ?? 'Unknown error' });
      }
    }

    return results;
  }
}
