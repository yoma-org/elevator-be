import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Equipment } from './equipment.entity';
import { Building } from './building.entity';

type MaintenanceReportPhoto = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

type MaintenanceReportNote = {
  id: string;
  at: string;
  author: string;
  kind: 'system' | 'dispatch' | 'review' | 'finance';
  text: string;
};

type MaintenanceReportChecklistItem = {
  label: string;
  checked: boolean;
};

type MaintenanceReportChecklistCategory = {
  category: string;
  items: MaintenanceReportChecklistItem[];
};

type MaintenanceReportChecklistResults = {
  equipment_type: string | null;
  templateName: string | null;
  checkedCount: number;
  totalCount: number;
  categories: MaintenanceReportChecklistCategory[];
};

@Entity({ name: 'maintenance_reports' })
export class MaintenanceReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Building, { nullable: false })
  @JoinColumn({ name: 'building_id' })
  building: Building;

  @ManyToOne(() => Equipment, (equipment) => equipment.reports, { nullable: false })
  @JoinColumn({ name: 'equipment_id' })
  equipment: Equipment;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  report_code: string | null;

  @Column({ type: 'varchar', length: 120 })
  maintenance_type: string;

  @Column({ type: 'timestamp without time zone' })
  arrival_date_time: Date;

  @Column({ type: 'varchar', length: 120 })
  technician_name: string;

  @Column({ type: 'varchar', length: 40, default: 'pending' })
  status: string;

  @Column({ type: 'varchar', length: 20, default: 'Medium' })
  priority: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  assigned_to: string | null;

  @Column({ type: 'text', nullable: true })
  findings: string | null;

  @Column({ type: 'jsonb', nullable: true })
  checklist_results: MaintenanceReportChecklistResults | null;

  @Column({ type: 'text', nullable: true })
  work_performed: string | null;

  @Column({ type: 'jsonb', nullable: true })
  parts_used: Array<{ name: string; quantity: number; status?: 'replaced' | 'needs-replacement' }> | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'jsonb', nullable: true })
  photos: MaintenanceReportPhoto[] | null;

  @Column({ type: 'text', nullable: true })
  technician_signature: string | null;

  @Column({ type: 'text', nullable: true })
  customer_signature: string | null;

  @Column({ type: 'jsonb', nullable: true })
  internal_notes: MaintenanceReportNote[] | null;

  @Column({ type: 'timestamp without time zone', default: () => 'CURRENT_TIMESTAMP' })
  submitted_at: Date;

  @CreateDateColumn({ type: 'timestamp without time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp without time zone' })
  updated_at: Date;
}
