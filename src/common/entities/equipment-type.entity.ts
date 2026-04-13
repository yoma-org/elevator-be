import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'equipment_types' })
export class EquipmentType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 40, nullable: true, unique: true })
  code: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  category: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;
}
