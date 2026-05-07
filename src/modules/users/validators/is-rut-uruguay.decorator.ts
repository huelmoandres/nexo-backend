import { registerDecorator, ValidationOptions } from 'class-validator';
import { validateUruguayRut12 } from '../utils/rut.validator';

export function IsRutUruguay(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRutUruguay',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && validateUruguayRut12(value);
        },
        defaultMessage(): string {
          return 'RUT uruguayo inválido: debe tener 12 dígitos y dígito verificador DGI válido';
        },
      },
    });
  };
}
