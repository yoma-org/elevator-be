import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Building } from '../common/entities/building.entity';
import { EquipmentType } from '../common/entities/equipment-type.entity';
import { Equipment } from '../common/entities/equipment.entity';

@Injectable()
export class EquipmentService implements OnModuleInit {
  constructor(
    @InjectRepository(Building)
    private readonly buildingRepository: Repository<Building>,
    @InjectRepository(EquipmentType)
    private readonly equipmentTypeRepository: Repository<EquipmentType>,
    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
  ) {}

  private async syncEquipmentTypeRelations(): Promise<void> {
    const managedTypes = await this.equipmentTypeRepository.find();
    if (managedTypes.length === 0) {
      return;
    }

    const typeMap = new Map(managedTypes.map((item) => [item.name.trim().toLowerCase(), item]));
    const equipmentItems = await this.equipmentRepository.find({
      relations: ['equipmentTypeInfo'],
    });

    const pendingUpdates = equipmentItems
      .filter((item) => !item.equipmentTypeInfo && item.equipmentType)
      .map((item) => {
        const match = typeMap.get(item.equipmentType.trim().toLowerCase());
        if (!match) {
          return null;
        }

        item.equipmentTypeInfo = match;
        item.equipmentType = match.name;
        return item;
      })
      .filter((item): item is Equipment => item !== null);

    if (pendingUpdates.length > 0) {
      await this.equipmentRepository.save(pendingUpdates);
    }
  }

  async onModuleInit(): Promise<void> {
    const equipmentTypeCount = await this.equipmentTypeRepository.count();
    if (equipmentTypeCount === 0) {
      await this.equipmentTypeRepository.save([
        {
          name: 'Elevator',
          code: 'ELEV',
          description: 'Passenger and service elevator systems',
          category: 'Vertical Transport',
          isActive: true,
        },
        {
          name: 'Escalator',
          code: 'ESCA',
          description: 'Escalator and moving walk systems',
          category: 'People Moving',
          isActive: true,
        },
        {
          name: 'Dumbwaiter',
          code: 'DUMB',
          description: 'Small goods lift equipment',
          category: 'Service Lift',
          isActive: true,
        },
      ]);
    }

    const allTypes = await this.equipmentTypeRepository.find();
    const typesByName = new Map(allTypes.map((item) => [item.name.trim().toLowerCase(), item]));

    const buildingCount = await this.buildingRepository.count();
    if (buildingCount > 0) {
      await this.syncEquipmentTypeRelations();
      return;
    }

    const [buildingA, buildingB] = await this.buildingRepository.save([
      {
        name: 'YOMA Tower, Yangon',
        code: 'YGN-YOMA',
        address: 'Downtown Yangon',
        contactName: 'Daw Thinzar',
        contactPhone: '09-420000111',
        isActive: true,
      },
      {
        name: 'Century Center, Mandalay',
        code: 'MDY-CENTURY',
        address: '78th Street, Mandalay',
        contactName: 'U Kyaw Soe',
        contactPhone: '09-420000222',
        isActive: true,
      },
    ]);

    await this.equipmentRepository.save([
      {
        equipmentType: 'Elevator',
        equipmentTypeInfo: typesByName.get('elevator') ?? null,
        equipmentCode: 'ELV-001',
        serialNumber: 'SN-YGN-001',
        brand: 'Mitsubishi',
        model: 'NexWay',
        location: 'Tower A - Lobby',
        isActive: true,
        building: buildingA,
      },
      {
        equipmentType: 'Elevator',
        equipmentTypeInfo: typesByName.get('elevator') ?? null,
        equipmentCode: 'ELV-002',
        serialNumber: 'SN-YGN-002',
        brand: 'Hitachi',
        model: 'Sigma',
        location: 'Tower B - Service Core',
        isActive: true,
        building: buildingA,
      },
      {
        equipmentType: 'Escalator',
        equipmentTypeInfo: typesByName.get('escalator') ?? null,
        equipmentCode: 'ESC-010',
        serialNumber: 'SN-MDY-010',
        brand: 'Otis',
        model: 'Transit',
        location: 'North Wing Entrance',
        isActive: true,
        building: buildingB,
      },
    ]);

    await this.syncEquipmentTypeRelations();
  }

  async getBuildings(): Promise<Building[]> {
    return this.buildingRepository.find({ order: { name: 'ASC' } });
  }

  async getEquipmentTypes(): Promise<
    Array<{
      equipmentType: string;
      id?: string;
      code?: string | null;
      category?: string | null;
      isActive?: boolean;
    }>
  > {
    const managedTypes = await this.equipmentTypeRepository.find({
      order: { name: 'ASC' },
    });

    if (managedTypes.length > 0) {
      return managedTypes.map((type) => ({
        id: type.id,
        equipmentType: type.name,
        code: type.code,
        category: type.category,
        isActive: type.isActive,
      }));
    }

    return this.equipmentRepository
      .createQueryBuilder('equipment')
      .select('equipment.equipmentType', 'equipmentType')
      .distinct(true)
      .orderBy('equipment.equipmentType', 'ASC')
      .getRawMany();
  }

  async getEquipmentByBuilding(buildingId: string, equipmentType?: string): Promise<Equipment[]> {
    const query = this.equipmentRepository
      .createQueryBuilder('equipment')
      .leftJoinAndSelect('equipment.building', 'building')
      .leftJoinAndSelect('equipment.equipmentTypeInfo', 'equipmentTypeInfo')
      .where('building.id = :buildingId', { buildingId })
      .orderBy('equipment.equipmentCode', 'ASC');

    if (equipmentType) {
      query.andWhere('equipment.equipmentType = :equipmentType', { equipmentType });
    }

    return query.getMany();
  }
}
