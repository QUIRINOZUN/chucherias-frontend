// =============================================================================
// core/clientes.ts — SERVICIO DE CLIENTES Y LEALTAD (Sprint 4, RF-21 a RF-23)
// =============================================================================
// Habla con /api/clientes: buscar/crear un cliente desde el cobro del POS, y
// listar/editar/ver el detalle desde la pantalla de gestión "Clientes".
// El cálculo de visitas y descuentos NUNCA se hace aquí ni en el servidor vía
// este archivo — vive en routes/ventas.js, que es quien conoce el subtotal
// real de cada compra; este servicio solo administra el catálogo de clientes.
// =============================================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Resultado de una búsqueda (typeahead del POS) o fila del listado.
export interface Cliente {
  id: number;
  nombre_completo: string;
  telefono: string | null;
  visitas_acumuladas: number;
  fecha_registro?: string;
}

// Un evento del historial de lealtad de un cliente.
export interface EventoLealtad {
  id: number;
  tipo_evento: 'visita' | 'descuento_aplicado';
  descripcion: string | null;
  fecha: string;
  venta_id: number | null;
  venta_total: string | null;
}

// Un producto dentro de una compra del historial.
export interface ItemCompra {
  producto: string;
  variante: string;
  cantidad: number;
  precio_unitario: string;
  cancelado: boolean;
}

// Una compra real del cliente (RF-21 "historial de compras" — distinto del
// historial de LEALTAD de arriba, que solo son visitas/descuentos; aquí
// van todas sus ventas, hayan contado como visita o no).
export interface CompraCliente {
  id: number;
  fecha: string;
  subtotal: string;
  descuento_lealtad: string;
  total: string;
  metodo_pago: 'efectivo' | 'transferencia';
  estado: 'completada' | 'cancelada';
  numero_orden: string;
  items: ItemCompra[];
}

export interface ClienteDetalle extends Cliente {
  historial: EventoLealtad[];
  compras: CompraCliente[];
}

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // GET /api/clientes/buscar?q=… — typeahead del cobro (administrador/
  // encargado/cajero). Menos de 2 caracteres no busca (el servidor también
  // lo valida, esto solo evita la llamada de red de más).
  buscar(q: string): Observable<Cliente[]> {
    if (q.trim().length < 2) {
      return new Observable((observer) => {
        observer.next([]);
        observer.complete();
      });
    }
    return this.http.get<Cliente[]>(`${this.apiUrl}/clientes/buscar`, { params: { q } });
  }

  // POST /api/clientes — alta rápida desde el cobro. Nace con 0 visitas.
  crear(nombreCompleto: string, telefono?: string): Observable<Cliente> {
    return this.http.post<Cliente>(`${this.apiUrl}/clientes`, {
      nombre_completo: nombreCompleto,
      telefono: telefono || null,
    });
  }

  // GET /api/clientes?buscar=… — listado de gestión (administrador/encargado).
  listar(buscar?: string): Observable<Cliente[]> {
    return this.http.get<Cliente[]>(`${this.apiUrl}/clientes`, {
      params: buscar ? { buscar } : {},
    });
  }

  // GET /api/clientes/:id — detalle + historial (administrador/encargado).
  obtener(id: number): Observable<ClienteDetalle> {
    return this.http.get<ClienteDetalle>(`${this.apiUrl}/clientes/${id}`);
  }

  // PATCH /api/clientes/:id — corrige nombre/teléfono (administrador/encargado).
  editar(id: number, nombreCompleto: string, telefono?: string): Observable<Cliente> {
    return this.http.patch<Cliente>(`${this.apiUrl}/clientes/${id}`, {
      nombre_completo: nombreCompleto,
      telefono: telefono || null,
    });
  }

  // DELETE /api/clientes/historial?desde=&hasta= — elimina el historial de
  // lealtad (visitas/descuentos) del rango, irreversible. Solo
  // administrador. No toca visitas_acumuladas de cada cliente.
  eliminarHistorial(desde: string, hasta: string): Observable<{ eliminados: number }> {
    return this.http.delete<{ eliminados: number }>(`${this.apiUrl}/clientes/historial`, {
      params: { desde, hasta },
    });
  }
}
