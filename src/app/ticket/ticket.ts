// =============================================================================
// ticket/ticket.ts — DATOS DEL TICKET (2026-11-10)
// =============================================================================
// Pantalla solo para el administrador donde se personaliza lo que se imprime
// en los tickets: nombre, titular, RFC, dirección, teléfono, horario, leyenda
// y logotipo. Se guarda en el servidor (/api/negocio) y el POS y Caja lo leen
// al imprimir. A la derecha se ve una vista previa del encabezado del ticket
// con lo que se va escribiendo (sin guardar todavía).
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { NegocioService, DatosNegocio } from '../core/negocio';
import { ThemeService } from '../core/theme';
import { ANCHO_TICKET, centrar, envolver, sinAcentos } from '../core/ticket-formato';

type CampoTexto = 'nombre' | 'titular' | 'rfc' | 'direccion' | 'telefono' | 'horario' | 'leyenda';

@Component({
  selector: 'app-ticket',
  standalone: true,
  templateUrl: './ticket.html',
  styleUrl: './ticket.css',
})
export class TicketComponent implements OnInit {
  readonly campos: { clave: CampoTexto; etiqueta: string; ayuda: string; max: number }[] = [
    {
      clave: 'nombre',
      etiqueta: 'Nombre del negocio',
      ayuda: 'Sale en grande arriba del ticket.',
      max: 80,
    },
    { clave: 'titular', etiqueta: 'Titular o razón social', ayuda: 'Opcional.', max: 120 },
    { clave: 'rfc', etiqueta: 'RFC', ayuda: 'Opcional. Déjalo vacío si no se imprime.', max: 20 },
    {
      clave: 'direccion',
      etiqueta: 'Dirección',
      ayuda: 'Calle, número y colonia o ciudad.',
      max: 200,
    },
    {
      clave: 'telefono',
      etiqueta: 'Teléfono de contacto',
      ayuda: 'Para pedidos o dudas.',
      max: 30,
    },
    {
      clave: 'horario',
      etiqueta: 'Horario de atención',
      ayuda: 'Ej. Martes a domingo, 2:00 pm a 9:30 pm.',
      max: 120,
    },
    {
      clave: 'leyenda',
      etiqueta: 'Leyenda al pie',
      ayuda: 'Ej. "Ticket de venta. No es comprobante fiscal."',
      max: 160,
    },
  ];

  form = signal<Record<CampoTexto, string>>({
    nombre: '',
    titular: '',
    rfc: '',
    direccion: '',
    telefono: '',
    horario: '',
    leyenda: '',
  });
  cargando = signal(true);
  guardando = signal(false);
  subiendoLogo = signal(false);
  mensaje = signal('');
  error = signal('');

  // Hay cambios sin guardar si algún campo difiere de lo que tiene el servidor.
  hayCambios = computed(() => {
    const d = this.negocioService.datos();
    const f = this.form();
    return this.campos.some((c) => (d[c.clave] ?? '') !== f[c.clave].trim());
  });

  // Vista previa del encabezado, con el mismo formato (32 columnas) que el ticket real.
  vistaPrevia = computed(() => {
    const f = this.form();
    const filas: string[] = [];
    const agregar = (texto: string) => {
      if (texto.trim()) {
        filas.push(...envolver(sinAcentos(texto.trim())).map((x) => centrar(x)));
      }
    };
    agregar(f.nombre.toUpperCase());
    agregar(f.titular);
    if (f.rfc.trim()) agregar(`RFC: ${f.rfc}`);
    agregar(f.direccion);
    if (f.telefono.trim()) agregar(`Tel: ${f.telefono}`);
    agregar(f.horario);
    filas.push('='.repeat(ANCHO_TICKET), centrar('TICKET DE VENTA'), '='.repeat(ANCHO_TICKET));
    filas.push('', '   ... productos y total ...', '');
    filas.push('-'.repeat(ANCHO_TICKET));
    filas.push(centrar('*** GRACIAS POR SU COMPRA ***'));
    agregar(f.leyenda);
    return filas.join('\n');
  });

  constructor(
    public negocioService: NegocioService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.negocioService.recargar().subscribe({
      next: () => {
        this.volcar(this.negocioService.datos());
        this.cargando.set(false);
      },
      error: () => {
        // Sin conexión: se editan los valores de siempre.
        this.volcar(this.negocioService.datos());
        this.cargando.set(false);
      },
    });
  }

  private volcar(d: DatosNegocio): void {
    this.form.set({
      nombre: d.nombre ?? '',
      titular: d.titular ?? '',
      rfc: d.rfc ?? '',
      direccion: d.direccion ?? '',
      telefono: d.telefono ?? '',
      horario: d.horario ?? '',
      leyenda: d.leyenda ?? '',
    });
  }

  actualizar(clave: CampoTexto, valor: string): void {
    this.form.update((f) => ({ ...f, [clave]: valor }));
    this.mensaje.set('');
  }

  guardar(): void {
    const f = this.form();
    if (!f.nombre.trim()) {
      this.error.set('El nombre del negocio no puede quedar vacío.');
      return;
    }
    this.guardando.set(true);
    this.error.set('');
    this.mensaje.set('');
    this.negocioService.guardar(f).subscribe({
      next: (d) => {
        this.volcar(d);
        this.guardando.set(false);
        this.mensaje.set('Listo: los tickets nuevos ya llevarán estos datos.');
      },
      error: (e: HttpErrorResponse) => {
        this.guardando.set(false);
        this.error.set(e.error?.error || 'No se pudieron guardar los datos.');
      },
    });
  }

  descartar(): void {
    this.volcar(this.negocioService.datos());
    this.error.set('');
    this.mensaje.set('');
  }

  elegirLogo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    this.subiendoLogo.set(true);
    this.error.set('');
    this.negocioService.subirLogo(archivo).subscribe({
      next: () => {
        this.subiendoLogo.set(false);
        this.mensaje.set('Logotipo actualizado.');
      },
      error: (e: HttpErrorResponse) => {
        this.subiendoLogo.set(false);
        this.error.set(e.error?.error || 'No se pudo subir el logotipo.');
      },
    });
  }

  restablecerLogo(): void {
    this.subiendoLogo.set(true);
    this.negocioService.quitarLogo().subscribe({
      next: () => {
        this.subiendoLogo.set(false);
        this.mensaje.set('Se volvió al logotipo original.');
      },
      error: (e: HttpErrorResponse) => {
        this.subiendoLogo.set(false);
        this.error.set(e.error?.error || 'No se pudo restablecer el logotipo.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
