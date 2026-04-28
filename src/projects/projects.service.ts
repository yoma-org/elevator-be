import { ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { CreateProjectDto } from '../common/dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly supabase: SupabaseService) {}

  async createProject(input: CreateProjectDto) {
    const supa = this.supabase.client;

    // 1. Get-or-create equipment_type by name (case-insensitive)
    const typeName = input.equipmentTypeName.trim();
    const { data: existingType } = await supa
      .from('equipment_types')
      .select('*')
      .ilike('name', typeName)
      .maybeSingle();

    let type = existingType;
    if (!type) {
      const code = input.equipmentTypeCode?.trim() || typeName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
      const { data: created, error } = await supa
        .from('equipment_types')
        .insert({ name: typeName, code, is_active: true })
        .select()
        .single();
      if (error) throw new ConflictException(`Cannot create equipment type: ${error.message}`);
      type = created;
    }

    // 2. Get-or-create building (case-insensitive)
    const buildingName = input.buildingName.trim();
    const { data: existingBuilding } = await supa
      .from('buildings')
      .select('*')
      .ilike('name', buildingName)
      .maybeSingle();

    let building = existingBuilding;
    let buildingCreated = false;
    if (!building) {
      const { data: created, error } = await supa
        .from('buildings')
        .insert({
          name: buildingName,
          team: input.team?.trim() || null,
          address: input.address?.trim() || null,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw new ConflictException(`Cannot create building: ${error.message}`);
      building = created;
      buildingCreated = true;
    } else if (input.team && !building.team) {
      // Backfill team if building exists but has no team yet
      const { data: updated } = await supa
        .from('buildings')
        .update({ team: input.team.trim() })
        .eq('id', building.id)
        .select()
        .single();
      if (updated) building = updated;
    }

    // 3. Insert equipment (skip duplicates by building_id + code, case-insensitive)
    const { data: existing } = await supa
      .from('equipment')
      .select('code')
      .eq('building_id', building.id);
    const existingCodes = new Set((existing ?? []).map((e: any) => String(e.code).trim().toLowerCase()));

    const requestedCodes = input.equipmentCodes.map((c) => c.trim()).filter(Boolean);
    const seenInRequest = new Set<string>();
    const newEquipments = requestedCodes
      .filter((code) => {
        const lower = code.toLowerCase();
        if (existingCodes.has(lower) || seenInRequest.has(lower)) return false;
        seenInRequest.add(lower);
        return true;
      })
      .map((code) => ({
        name: type.name,
        code,
        building_id: building.id,
        equipment_type_id: type.id,
        is_active: true,
      }));

    let inserted: any[] = [];
    if (newEquipments.length > 0) {
      const { data, error } = await supa.from('equipment').insert(newEquipments).select();
      if (error) throw new InternalServerErrorException(`Cannot insert equipment: ${error.message}`);
      inserted = data ?? [];
    }

    return {
      building: {
        id: building.id,
        name: building.name,
        team: building.team,
        address: building.address,
        created: buildingCreated,
      },
      equipmentType: {
        id: type.id,
        name: type.name,
        code: type.code,
      },
      equipment: inserted.map((e) => ({ id: e.id, code: e.code, name: e.name })),
      skipped: requestedCodes.length - newEquipments.length,
    };
  }
}
