// =============================================================================
// core/negocio.ts — DATOS DEL ESTABLECIMIENTO PARA LOS TICKETS
// =============================================================================
// Lo que se imprime en el encabezado y pie de cada ticket de venta. Los campos
// vacíos ('') simplemente no se imprimen: llénalos aquí cuando se tengan
// (dirección, teléfono, RFC) y aparecerán solos en el ticket con diseño y en
// el de texto plano. Nada de esto viaja al servidor.
// =============================================================================
export const NEGOCIO = {
  nombre: 'Chucherías Mix',
  titular: 'Reyna Ximena Morales Berumen',
  rfc: '',
  direccion: '',
  telefono: '',
  horario: 'Martes a domingo, 2:00 pm a 9:30 pm',
  leyenda: 'Ticket de venta. No es comprobante fiscal.',
};
