import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { IsRutUruguay } from '../validators/is-rut-uruguay.decorator';

class SampleDto {
  @IsRutUruguay()
  rut!: string;
}

describe('IsRutUruguay', () => {
  it('falla cuando el RUT no es válido', async () => {
    const dto = plainToInstance(SampleDto, { rut: '000000000001' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('pasa cuando el RUT es válido (12 ceros)', async () => {
    const dto = plainToInstance(SampleDto, { rut: '000000000000' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
