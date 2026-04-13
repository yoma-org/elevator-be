import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EquipmentType } from './equipment-type.entity';

export type ChecklistTemplateCategory = {
  category: string;
  items: string[];
};

@Entity({ name: 'checklist_templates' })
export class ChecklistTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  categories!: ChecklistTemplateCategory[];

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @ManyToOne(() => EquipmentType, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equipment_type_id' })
  equipment_type!: EquipmentType;

  @CreateDateColumn({ type: 'timestamp without time zone' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp without time zone' })
  updated_at!: Date;
}
