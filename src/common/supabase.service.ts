import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  public readonly client: any;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('SUPABASE_URL')!;
    const key = this.configService.get<string>('SUPABASE_SERVICE_KEY')!;
    const schema = this.configService.get<string>('DB_SCHEMA', 'elevator');
    this.client = createClient(url, key, {
      db: { schema },
    } as any);
  }
}
