// =============================================================================
// promociones/promociones.ts — PROMOCIONES CON VIGENCIA (2026-11-16)
// =============================================================================
// Pantalla "Promociones". Solo administrador y encargado. Descuentos por
// porcentaje o monto fijo sobre todo el menú, una categoría, un producto o una
// variante, opcionalmente solo ciertos días, en cierto horario y/o entre dos
// fechas. La promoción vigente se convierte en el precio de la variante en el
// POS (el servidor lo recalcula al cobrar). Si dos aplican a lo mismo, gana la
// que más descuenta (no se suman).
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { CatalogoService, Categoria, Producto } from '../core/catalogo';
import { FocoDialogoDirective } from '../core/foco-dialogo';
import {
  AlcancePromocion,
  DatosPromocion,
  Promocion,
  PromocionesService,
  TipoPromocion,
} from '../core/promociones';
import { ThemeService } from '../core/theme';

const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface FormularioPromocion {
  id: number | null;
  nombre: string;
  tipo: TipoPromocion;
  valor: string;
  alcance: AlcancePromocion;
  alcanceId: number | null;
  dias: number[];
  horaInicio: string;
  horaFin: string;
  fechaInicio: string;
  fechaFin: string;
}

@Component({
  selector: 'app-promociones',
  standalone: true,
  imports: [CurrencyPipe, FocoDialogoDirective],
  templateUrl: './promociones.html',
  styleUrl: './promociones.css',
})
export class PromocionesComponent implements OnInit {
  readonly NOMBRES_DIA = NOMBRES_DIA;
  readonly DIAS = [1, 2, 3, 4, 5, 6, 0]; // lunes primero

  promociones = signal<Promocion[]>([]);
  categorias = signal<Categoria[]>([]);
  productos = signal<Producto[]>([]);
  cargando = signal(true);
  error = signal('');
  form = signal<FormularioPromocion | null>(null);
  errorForm = signal('');
  guardando = signal(false);
  aEliminar = signal<Promocion | null>(null);
  errorEliminar = signal('');

  // Variantes con su nombre completo para el selector "aplica a una variante".
  variantes = computed(() =>
    this.productos().flatMap((p) =>
      p.variantes.map((v) => ({ id: v.id, nombre: `${p.nombre} — ${v.nombre}` })),
    ),
  );

  constructor(
    private promocionesService: PromocionesService,
    private catalogoService: CatalogoService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.catalogoService.obtenerCategorias().subscribe((c) => this.categorias.set(c));
    this.catalogoService.obtenerProductos().subscribe((p) => this.productos.set(p));
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set('');
    this.promocionesService.listar().subscribe({
      next: (lista) => {
        this.promociones.set(lista);
        this.cargando.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(e.error?.error || 'No se pudieron cargar las promociones.');
      },
    });
  }

  // Texto legible de a qué aplica una promoción.
  aplicaA(p: Promocion): string {
    if (p.alcance === 'todo') return 'Todo el menú';
    if (p.alcance === 'categoria')
      return 'Categoría: ' + (this.categorias().find((c) => c.id === p.alcance_id)?.nombre ?? '—');
    if (p.alcance === 'producto')
      return 'Producto: ' + (this.productos().find((x) => x.id === p.alcance_id)?.nombre ?? '—');
    return 'Variante: ' + (this.variantes().find((v) => v.id === p.alcance_id)?.nombre ?? '—');
  }

  // Texto legible de cuándo aplica.
  cuando(p: Promocion): string {
    const partes: string[] = [];
    partes.push(
      p.dias_semana?.length
        ? p.dias_semana.map((d) => NOMBRES_DIA[d]).join(', ')
        : 'Todos los días',
    );
    if (p.hora_inicio && p.hora_fin)
      partes.push(`${p.hora_inicio.slice(0, 5)}–${p.hora_fin.slice(0, 5)}`);
    if (p.fecha_inicio || p.fecha_fin)
      partes.push(`${p.fecha_inicio ?? '…'} a ${p.fecha_fin ?? '…'}`);
    return partes.join(' · ');
  }

  abrir(p?: Promocion): void {
    this.errorForm.set('');
    this.form.set({
      id: p?.id ?? null,
      nombre: p?.nombre ?? '',
      tipo: p?.tipo ?? 'porcentaje',
      valor: p ? String(p.valor) : '',
      alcance: p?.alcance ?? 'todo',
      alcanceId: p?.alcance_id ?? null,
      dias: p?.dias_semana ?? [],
      horaInicio: p?.hora_inicio?.slice(0, 5) ?? '',
      horaFin: p?.hora_fin?.slice(0, 5) ?? '',
      fechaInicio: p?.fecha_inicio ?? '',
      fechaFin: p?.fecha_fin ?? '',
    });
  }

  campo<K extends keyof FormularioPromocion>(clave: K, valor: FormularioPromocion[K]): void {
    this.form.update((f) => (f ? { ...f, [clave]: valor } : f));
  }

  cambiarAlcance(alcance: AlcancePromocion): void {
    this.form.update((f) => (f ? { ...f, alcance, alcanceId: null } : f));
  }

  alternarDia(dia: number): void {
    this.form.update((f) => {
      if (!f) return f;
      const dias = f.dias.includes(dia) ? f.dias.filter((d) => d !== dia) : [...f.dias, dia];
      return { ...f, dias };
    });
  }

  guardar(): void {
    const f = this.form();
    if (!f) return;
    const valor = Number(f.valor);
    if (!f.nombre.trim()) return this.errorForm.set('Ponle un nombre a la promoción.');
    if (!Number.isFinite(valor) || valor <= 0)
      return this.errorForm.set('El valor debe ser mayor a cero.');
    if (f.tipo === 'porcentaje' && valor > 100)
      return this.errorForm.set('Un porcentaje no puede pasar de 100.');
    if (f.alcance !== 'todo' && f.alcanceId === null)
      return this.errorForm.set('Elige a qué aplica la promoción.');
    if ((f.horaInicio || f.horaFin) && !(f.horaInicio && f.horaFin))
      return this.errorForm.set('Captura la hora de inicio y la de fin.');

    const datos: DatosPromocion = {
      nombre: f.nombre.trim(),
      tipo: f.tipo,
      valor,
      alcance: f.alcance,
      alcance_id: f.alcance === 'todo' ? null : f.alcanceId,
      dias_semana: f.dias.length ? f.dias : null,
      hora_inicio: f.horaInicio || null,
      hora_fin: f.horaFin || null,
      fecha_inicio: f.fechaInicio || null,
      fecha_fin: f.fechaFin || null,
    };
    this.guardando.set(true);
    this.errorForm.set('');
    const peticion =
      f.id === null
        ? this.promocionesService.crear(datos)
        : this.promocionesService.editar(f.id, datos);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.form.set(null);
        this.cargar();
      },
      error: (e: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorForm.set(e.error?.error || 'No se pudo guardar la promoción.');
      },
    });
  }

  alternarActivo(p: Promocion): void {
    this.promocionesService.cambiarActivo(p.id, !p.activo).subscribe({
      next: () => this.cargar(),
      error: (e: HttpErrorResponse) =>
        this.error.set(e.error?.error || 'No se pudo cambiar el estado.'),
    });
  }

  confirmarEliminar(): void {
    const p = this.aEliminar();
    if (!p) return;
    this.promocionesService.eliminar(p.id).subscribe({
      next: () => {
        this.aEliminar.set(null);
        this.cargar();
      },
      error: (e: HttpErrorResponse) =>
        this.errorEliminar.set(e.error?.error || 'No se pudo eliminar.'),
    });
  }
}
