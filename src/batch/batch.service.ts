import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

interface BuildingRow {
  name: string;
  code?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
}

interface EquipmentRow {
  buildingName: string;
  equipmentType: string;
  equipmentCode: string;
  serialNumber?: string;
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
            contactName: row.contactName?.trim() || null,
            contactPhone: row.contactPhone?.trim() || null,
            isActive: true,
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
        if (!row.equipmentType?.trim()) {
          results.push({ row: i + 1, status: 'error', message: 'Equipment type is required' });
          continue;
        }
        if (!row.equipmentCode?.trim()) {
          results.push({ row: i + 1, status: 'error', message: 'Equipment code is required' });
          continue;
        }

        const buildingId = buildingMap.get(row.buildingName.trim().toLowerCase());
        if (!buildingId) {
          results.push({ row: i + 1, status: 'error', message: `Building "${row.buildingName}" not found` });
          continue;
        }

        const typeId = typeMap.get(row.equipmentType.trim().toLowerCase()) ?? null;

        // Check duplicate equipment code in same building
        const { data: existing } = await this.supabase.client
          .from('equipment')
          .select('id')
          .eq('buildingId', buildingId)
          .eq('equipmentCode', row.equipmentCode.trim())
          .limit(1);

        if (existing && existing.length > 0) {
          results.push({ row: i + 1, status: 'error', message: `Equipment "${row.equipmentCode}" already exists in this building` });
          continue;
        }

        const { data, error } = await this.supabase.client
          .from('equipment')
          .insert({
            buildingId,
            equipmentType: row.equipmentType.trim(),
            equipmentTypeId: typeId,
            equipmentCode: row.equipmentCode.trim(),
            serialNumber: row.serialNumber?.trim() || null,
            brand: row.brand?.trim() || null,
            model: row.model?.trim() || null,
            location: row.location?.trim() || null,
            isActive: true,
          })
          .select()
          .single();

        if (error) {
          results.push({ row: i + 1, status: 'error', message: error.message });
        } else {
          results.push({ row: i + 1, status: 'created', message: `Equipment "${data.equipmentCode}" created`, data });
        }
      } catch (err: any) {
        results.push({ row: i + 1, status: 'error', message: err.message ?? 'Unknown error' });
      }
    }

    return results;
  }
}
