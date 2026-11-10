// =============================================================================
// core/negocio.ts — DATOS DEL ESTABLECIMIENTO PARA LOS TICKETS
// =============================================================================
// Lo que se imprime en el encabezado y pie de cada ticket (nombre, titular,
// RFC, dirección, teléfono, horario, leyenda y logotipo). Los edita el
// administrador desde el módulo "Datos del ticket" y viven en el servidor
// (GET/PATCH /api/negocio). Los campos vacíos simplemente no se imprimen.
// Mientras llegan del servidor (o si falla la consulta) se usan los valores de
// siempre, para que imprimir nunca se rompa.
// =============================================================================
import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface DatosNegocio {
  nombre: string;
  titular: string;
  rfc: string;
  direccion: string;
  telefono: string;
  horario: string;
  leyenda: string;
  logo_url: string | null;
}

export const LOGO_POR_DEFECTO =
  'https://res.cloudinary.com/isjkpamh/image/upload/v1792190975/chucherias/marca/xnua730fuk6dau2nsko1.png';

export const NEGOCIO: DatosNegocio = {
  nombre: 'Chucherías Mix',
  titular: 'Reyna Ximena Morales Berumen',
  rfc: '',
  direccion: 'Av. 5 de Mayo #400, Francisco I. Madero, Durango',
  telefono: '677 883 1025',
  horario: 'Martes a domingo, 2:00 pm a 9:30 pm',
  leyenda: 'Ticket de venta. No es comprobante fiscal.',
  logo_url: null,
};

@Injectable({ providedIn: 'root' })
export class NegocioService {
  private readonly apiUrl = `${environment.apiUrl}/negocio`;

  readonly datos = signal<DatosNegocio>(NEGOCIO);
  // Logo que se imprime: el personalizado o, si no hay, el original.
  readonly logoUrl = computed(() => this.datos().logo_url || LOGO_POR_DEFECTO);

  constructor(private http: HttpClient) {}

  // Carga los datos vigentes. Falla en silencio: se quedan los de siempre.
  cargar(): void {
    this.http.get<DatosNegocio>(this.apiUrl).subscribe({
      next: (d) => this.datos.set(d),
      error: () => {},
    });
  }

  // Igual que cargar(), pero devuelve el Observable (para saber cuándo llegaron).
  recargar(): Observable<DatosNegocio> {
    return this.http.get<DatosNegocio>(this.apiUrl).pipe(tap((d) => this.datos.set(d)));
  }

  guardar(cambios: Partial<Omit<DatosNegocio, 'logo_url'>>): Observable<DatosNegocio> {
    return this.http.patch<DatosNegocio>(this.apiUrl, cambios).pipe(tap((d) => this.datos.set(d)));
  }

  subirLogo(archivo: File): Observable<DatosNegocio> {
    const formulario = new FormData();
    formulario.append('imagen', archivo);
    return this.http
      .post<DatosNegocio>(`${this.apiUrl}/logo`, formulario)
      .pipe(tap((d) => this.datos.set(d)));
  }

  quitarLogo(): Observable<DatosNegocio> {
    return this.http
      .delete<DatosNegocio>(`${this.apiUrl}/logo`)
      .pipe(tap((d) => this.datos.set(d)));
  }
}
