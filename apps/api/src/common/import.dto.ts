import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

export type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

/** Generic import body: parsed spreadsheet rows from the client. */
export class ImportRowsDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Array of row objects keyed by column name',
  })
  @IsArray()
  rows!: Record<string, unknown>[];
}
