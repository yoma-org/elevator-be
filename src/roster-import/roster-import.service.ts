import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

// Payload shapes parsed from Excel by the frontend.
export interface RosterImportPayload {
  fileName?: string;
  buildings: Array<{ name: string; address?: string | null }>;
  equipmentTypes: Array<{ name: string; code?: string | null }>;
  equipment: Array<{
    buildingName: string;      // looked up against buildings by name
    equipmentTypeName: string; // looked up against equipment_types by name
    code: string;              // equipment.code
    model?: string | null;
    serialNumber?: string | null;
    brand?: string | null;
    location?: string | null;
  }>;
}

export interface PreviewResponse {
  buildings: { new: number; existing: number; skipped: string[] };
  equipmentTypes: { new: number; existing: number };
  equipment: { new: number; conflicts: Array<{ buildingName: string; code: string; reason: string }> };
}

@Injectable()
export class RosterImportService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Preview: report how many records will be created / skipped without writing. */
  async preview(payload: RosterImportPayload): Promise<PreviewResponse> {
    this.validate(payload);

    const { data: existingBuildings } = await this.supabase.client
      .from('buildings').select('name');
    const bSet = new Set((existingBuildings ?? []).map((b: any) => String(b.name).trim().toLowerCase()));

    const { data: existingTypes } = await this.supabase.client
      .from('equipment_types').select('name');
    const tSet = new Set((existingTypes ?? []).map((t: any) => String(t.name).trim().toLowerCase()));

    const { data: existingEquipment } = await this.supabase.client
      .from('equipment').select('code, building_id, buildings(name)');
    const eqKey = new Map<string, true>();
    (existingEquipment ?? []).forEach((e: any) => {
      const key = `${String(e.buildings?.name ?? '').trim().toLowerCase()}|${String(e.code).trim().toLowerCase()}`;
      eqKey.set(key, true);
    });

    const newBuildings = payload.buildings.filter(b => !bSet.has(b.name.trim().toLowerCase()));
    const newTypes = payload.equipmentTypes.filter(t => !tSet.has(t.name.trim().toLowerCase()));
    const conflicts: PreviewResponse['equipment']['conflicts'] = [];
    let newEq = 0;
    for (const e of payload.equipment) {
      const key = `${e.buildingName.trim().toLowerCase()}|${e.code.trim().toLowerCase()}`;
      if (eqKey.has(key)) {
        conflicts.push({ buildingName: e.buildingName, code: e.code, reason: 'Equipment code already exists in this building' });
      } else {
        newEq++;
      }
    }

    return {
      buildings: { new: newBuildings.length, existing: payload.buildings.length - newBuildings.length, skipped: [] },
      equipmentTypes: { new: newTypes.length, existing: payload.equipmentTypes.length - newTypes.length },
      equipment: { new: newEq, conflicts },
    };
  }

  /** Import records tagged with a batch_id for easy undo. */
  async importBatch(payload: RosterImportPayload, user: { name?: string; email?: string }) {
    this.validate(payload);

    // 1. Create batch record first
    const { data: batch, error: batchErr } = await this.supabase.client
      .from('import_batches')
      .insert({
        imported_by: user.name ?? 'Unknown',
        imported_by_email: user.email ?? null,
        file_name: payload.fileName ?? null,
        source: 'roster-excel',
        stats: {},
      })
      .select()
      .single();
    if (batchErr || !batch) throw new InternalServerErrorException(batchErr?.message ?? 'Failed to create import batch');
    const batchId = batch.id as string;

    let insertedBuildings = 0;
    let insertedTypes = 0;
    let insertedEquipment = 0;
    const errors: string[] = [];

    try {
      // 2. Insert equipment_types (skip duplicates by name)
      const { data: existingTypes } = await this.supabase.client
        .from('equipment_types').select('id, name');
      const typeNameToId = new Map<string, string>();
      (existingTypes ?? []).forEach((t: any) => typeNameToId.set(String(t.name).trim().toLowerCase(), t.id));

      for (const t of payload.equipmentTypes) {
        const key = t.name.trim().toLowerCase();
        if (typeNameToId.has(key)) continue;
        const { data, error } = await this.supabase.client
          .from('equipment_types')
          .insert({ name: t.name.trim(), code: t.code?.trim() || null, import_batch_id: batchId })
          .select()
          .single();
        if (error) { errors.push(`type "${t.name}": ${error.message}`); continue; }
        typeNameToId.set(key, data.id);
        insertedTypes++;
      }

      // 3. Insert buildings (skip duplicates by name)
      const { data: existingBuildings } = await this.supabase.client
        .from('buildings').select('id, name');
      const buildingNameToId = new Map<string, string>();
      (existingBuildings ?? []).forEach((b: any) => buildingNameToId.set(String(b.name).trim().toLowerCase(), b.id));

      for (const b of payload.buildings) {
        const key = b.name.trim().toLowerCase();
        if (buildingNameToId.has(key)) continue;
        const { data, error } = await this.supabase.client
          .from('buildings')
          .insert({
            name: b.name.trim(),
            address: b.address?.trim() || null,
            is_active: true,
            import_batch_id: batchId,
          })
          .select()
          .single();
        if (error) { errors.push(`building "${b.name}": ${error.message}`); continue; }
        buildingNameToId.set(key, data.id);
        insertedBuildings++;
      }

      // 4. Insert equipment (skip if (building_id, code) exists)
      const { data: existingEquipment } = await this.supabase.client
        .from('equipment').select('code, building_id');
      const equipmentKey = new Set<string>();
      (existingEquipment ?? []).forEach((e: any) => equipmentKey.add(`${e.building_id}|${String(e.code).trim().toLowerCase()}`));

      for (const e of payload.equipment) {
        const buildingId = buildingNameToId.get(e.buildingName.trim().toLowerCase());
        if (!buildingId) { errors.push(`equipment "${e.code}": building "${e.buildingName}" not found`); continue; }
        const typeId = typeNameToId.get(e.equipmentTypeName.trim().toLowerCase()) ?? null;
        const dupKey = `${buildingId}|${e.code.trim().toLowerCase()}`;
        if (equipmentKey.has(dupKey)) continue; // skip duplicates silently

        const { error } = await this.supabase.client
          .from('equipment')
          .insert({
            name: e.equipmentTypeName.trim(),
            code: e.code.trim(),
            model: e.model?.trim() || null,
            serial_number: e.serialNumber?.trim() || null,
            brand: e.brand?.trim() || null,
            location: e.location?.trim() || null,
            is_active: true,
            building_id: buildingId,
            equipment_type_id: typeId,
            import_batch_id: batchId,
          });
        if (error) { errors.push(`equipment "${e.code}" @ "${e.buildingName}": ${error.message}`); continue; }
        equipmentKey.add(dupKey);
        insertedEquipment++;
      }

      // 5. Update batch stats
      await this.supabase.client
        .from('import_batches')
        .update({
          stats: {
            buildings: insertedBuildings,
            equipment_types: insertedTypes,
            equipment: insertedEquipment,
            errors: errors.length,
          },
          notes: errors.length ? errors.slice(0, 20).join('\n') : null,
        })
        .eq('id', batchId);

      return {
        batchId,
        inserted: { buildings: insertedBuildings, equipmentTypes: insertedTypes, equipment: insertedEquipment },
        errors,
      };
    } catch (e: any) {
      // On catastrophic failure, roll back whatever we inserted
      await this.undoBatch(batchId);
      throw new InternalServerErrorException(`Import failed and was rolled back: ${e.message}`);
    }
  }

  /** List all batches ordered newest first. */
  async listBatches() {
    const { data, error } = await this.supabase.client
      .from('import_batches')
      .select('*')
      .order('imported_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return data ?? [];
  }

  /** Check whether a batch can be safely undone (no FK references from reports). */
  async checkBatchUsage(batchId: string) {
    const { data: batch } = await this.supabase.client
      .from('import_batches').select('*').eq('id', batchId).single();
    if (!batch) throw new NotFoundException('Batch not found');

    const { data: eqIds } = await this.supabase.client
      .from('equipment').select('id').eq('import_batch_id', batchId);
    const ids = (eqIds ?? []).map((e: any) => e.id);

    let blockedByReports = 0;
    if (ids.length > 0) {
      const { count } = await this.supabase.client
        .from('maintenance_reports')
        .select('id', { count: 'exact', head: true })
        .in('equipment_id', ids);
      blockedByReports = count ?? 0;
    }
    return { batch, blockedByReports };
  }

  /** Undo a batch — deletes records tagged with this batch_id. */
  async undoBatch(batchId: string, force = false) {
    const { blockedByReports, batch } = await this.checkBatchUsage(batchId);
    if (blockedByReports > 0 && !force) {
      throw new ConflictException(
        `Cannot undo: ${blockedByReports} maintenance report(s) depend on equipment from this batch. Pass force=true to unlink.`,
      );
    }

    // If force: null out equipment_id on affected reports first
    if (blockedByReports > 0 && force) {
      const { data: eqIds } = await this.supabase.client
        .from('equipment').select('id').eq('import_batch_id', batchId);
      const ids = (eqIds ?? []).map((e: any) => e.id);
      if (ids.length > 0) {
        // maintenance_reports.equipment_id is NOT NULL, so we cannot just nullify.
        // Instead, delete the maintenance_reports tied to this batch.
        await this.supabase.client
          .from('maintenance_reports').delete().in('equipment_id', ids);
      }
    }

    // Delete in reverse FK order
    const { count: eqDel } = await this.supabase.client
      .from('equipment').delete({ count: 'exact' }).eq('import_batch_id', batchId);
    const { count: buildingDel } = await this.supabase.client
      .from('buildings').delete({ count: 'exact' }).eq('import_batch_id', batchId);
    const { count: typeDel } = await this.supabase.client
      .from('equipment_types').delete({ count: 'exact' }).eq('import_batch_id', batchId);
    await this.supabase.client.from('import_batches').delete().eq('id', batchId);

    return {
      batch,
      deleted: {
        equipment: eqDel ?? 0,
        buildings: buildingDel ?? 0,
        equipment_types: typeDel ?? 0,
      },
    };
  }

  private validate(payload: RosterImportPayload) {
    if (!payload || !Array.isArray(payload.buildings) || !Array.isArray(payload.equipmentTypes) || !Array.isArray(payload.equipment)) {
      throw new BadRequestException('Payload must include buildings, equipmentTypes, equipment arrays');
    }
  }
}
