import { IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export async function bulkRun(ids: string[] | undefined, fn: (id: string) => Promise<unknown>) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  let done = 0;
  let skipped = 0;
  for (const id of unique) {
    try {
      await fn(id);
      done += 1;
    } catch {
      skipped += 1;
    }
  }
  return { done, skipped, total: unique.length };
}
