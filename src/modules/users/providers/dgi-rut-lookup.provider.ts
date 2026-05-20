export interface DgiRutLookupResult {
  rut: string;
  razonSocial: string;
  activo: boolean;
}

/**
 * Consulta datos oficiales de un contribuyente a partir de la URL del QR DGI.
 */
export interface IDgiRutLookupProvider {
  lookup(url: string): Promise<DgiRutLookupResult>;
}

export const DGI_RUT_LOOKUP_TOKEN = Symbol('DGI_RUT_LOOKUP_TOKEN');
