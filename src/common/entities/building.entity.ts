import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Equipment } from './equipment.entity';

@Entity({ name: 'buildings' })
export class Building {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 40, unique: true, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 250, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  contact_name: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  contact_phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  team: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @OneToMany(() => Equipment, (equipment) => equipment.building)
  equipment: Equipment[];
}
