import { ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { UpdateBuildingDto } from '../common/dto/update-building.dto';

@Injectable()
export class BuildingsService {
  constructor(private readonly supabase: SupabaseService) {}

  async listWithSummary() {
    const supa = this.supabase.client;

    const [{ data: buildings, error: bErr }, { data: equipments, error: eErr }] = await Promise.all([
      supa
        .from('buildings')
        .select('id, name, code, address, contact_name, contact_phone, team, is_active')
        .order('name', { ascending: true }),
      supa.from('equipment').select('id, building_id, name'),
    ]);

    if (bErr) throw new InternalServerErrorException(bErr.message);
    if (eErr) throw new InternalServerErrorException(eErr.message);

    const equipmentByBuilding = new Map<string, { count: number; types: Set<string> }>();
    for (const eq of equipments ?? []) {
      const bid = (eq as any).building_id as string;
      if (!bid) continue;
      let entry = equipmentByBuilding.get(bid);
      if (!entry) {
        entry = { count: 0, types: new Set() };
        equipmentByBuilding.set(bid, entry);
      }
      entry.count += 1;
      const typeName = (eq as any).name as string | null;
      if (typeName) entry.types.add(typeName);
    }

    return (buildings ?? []).map((b: any) => {
      const summary = equipmentByBuilding.get(b.id);
      return {
        id: b.id,
        name: b.name,
        code: b.code,
        address: b.address,
        contact_name: b.contact_name,
        contact_phone: b.contact_phone,
        team: b.team,
        is_active: b.is_active,
        equipmentCount: summary?.count ?? 0,
        equipmentTypes: summary ? [...summary.types].sort() : [],
      };
    });
  }

  async addEquipment(buildingId: string, items: Array<{ code: string; equipmentTypeId: string }>) {
    const supa = this.supabase.client;

    const { data: building } = await supa.from('buildings').select('id').eq('id', buildingId).maybeSingle();
    if (!building) throw new NotFoundException('Building not found');

    const cleaned = (items ?? [])
      .map((i) => ({ code: i.code?.trim() ?? '', equipmentTypeId: i.equipmentTypeId?.trim() ?? '' }))
      .filter((i) => i.code && i.equipmentTypeId);
    if (cleaned.length === 0) {
      return { success: true, equipment: [], skipped: 0 };
    }

    // Resolve type names so we can denormalize equipment.name
    const typeIds = [...new Set(cleaned.map((i) => i.equipmentTypeId))];
    const { data: types } = await supa.from('equipment_types').select('id, name').in('id', typeIds);
    const typeNameById = new Map<string, string>();
    for (const t of types ?? []) typeNameById.set((t as any).id, (t as any).name);
    const missing = typeIds.filter((id) => !typeNameById.has(id));
    if (missing.length > 0) throw new ConflictException(`Unknown equipment type id(s): ${missing.join(', ')}`);

    // Skip duplicates by (building_id, code) — case-insensitive
    const { data: existing } = await supa.from('equipment').select('code').eq('building_id', buildingId);
    const existingCodes = new Set((existing ?? []).map((e: any) => String(e.code).trim().toLowerCase()));
    const seen = new Set<string>();
    const toInsert = cleaned
      .filter((i) => {
        const k = i.code.toLowerCase();
        if (existingCodes.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((i) => ({
        name: typeNameById.get(i.equipmentTypeId)!,
        code: i.code,
        building_id: buildingId,
        equipment_type_id: i.equipmentTypeId,
        is_active: true,
      }));

    if (toInsert.length === 0) {
      return { success: true, equipment: [], skipped: cleaned.length };
    }

    const { data, error } = await supa.from('equipment').insert(toInsert).select();
    if (error) throw new InternalServerErrorException(error.message);
    return { success: true, equipment: data ?? [], skipped: cleaned.length - toInsert.length };
  }

  async update(id: string, body: UpdateBuildingDto) {
    const supa = this.supabase.client;

    const { data: existing } = await supa.from('buildings').select('id, name').eq('id', id).maybeSingle();
    if (!existing) throw new NotFoundException('Building not found');

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) throw new ConflictException('Building name cannot be empty');
      // check uniqueness if name changed
      if (trimmed.toLowerCase() !== String(existing.name).trim().toLowerCase()) {
        const { data: dup } = await supa
          .from('buildings')
          .select('id')
          .ilike('name', trimmed)
          .neq('id', id)
          .maybeSingle();
        if (dup) throw new ConflictException(`Another building already uses the name "${trimmed}"`);
      }
      updates.name = trimmed;
    }
    if (body.team !== undefined) {
      updates.team = body.team === null ? null : (body.team?.trim() || null);
    }

    if (Object.keys(updates).length === 0) {
      return { success: true, building: existing };
    }

    const { data, error } = await supa.from('buildings').update(updates).eq('id', id).select().single();
    if (error) throw new InternalServerErrorException(error.message);

    return { success: true, building: data };
  }
}
