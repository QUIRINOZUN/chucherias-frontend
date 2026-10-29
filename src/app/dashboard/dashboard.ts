// =============================================================================
// dashboard/dashboard.ts — MENÚ PRINCIPAL DE MÓDULOS (filtrado por rol)
// =============================================================================
// Es la pantalla a la que se llega tras iniciar sesión. Muestra una tarjeta por
// cada módulo al que el usuario tiene permiso. Cada rol ve solo lo suyo:
//
//   administrador → Punto de venta, Comandas, Corte de caja, Ventas,
//                   Ventas especiales, Recetario, Inventario, Mermas,
//                   Usuarios, Asistencias, Nómina, Clientes, Gastos,
//                   Reportes, Checklist
//   encargado     → (los mismos 15 que administrador)
//   cajero        → Punto de venta, Comandas (consulta), Corte de caja,
//                   Ventas especiales, Checklist
//   auxiliar      → Comandas, Checklist
//
// PARA AGREGAR UN MÓDULO NUEVO: añade su entrada a MODULOS (ruta, título,
// ícono, descripción y roles) y registra la misma ruta con rolGuard en
// app.routes.ts. La lista de roles debe coincidir con la del backend.
//
// 2026-10-11: se retiró el widget de autoservicio de asistencia ("Marcar mi
// entrada/salida") a petición del usuario — registrar asistencia vuelve a
// ser exclusivo de administrador/encargado desde el módulo Asistencias (ver
// routes/asistencias.js y routes/auth.js).
//
// 2026-10-11: franja "Resumen de hoy" arriba de la rejilla de módulos —
// ventas + efectivo esperado (administrador/encargado/cajero, mismos roles
// que ya pueden consultar GET /api/caja/resumen) y personal en turno ahora
// mismo (administrador/encargado, mismos roles que GET /api/asistencias/hoy).
// Antes esa franja de la pantalla era espacio vacío sin usar: .dashboard-cuerpo
// centra verticalmente su contenido (`justify-content: center`), así que con
// solo la rejilla de módulos quedaba un hueco grande en viewports altos.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth';
import { ThemeService } from '../core/theme';
import { RecetasService } from '../core/recetas';
import { CajaService, ResumenCaja } from '../core/caja';
import { AsistenciasService } from '../core/asistencias';

// Descripción de una tarjeta del menú.
interface Modulo {
  // URL de la pantalla (debe existir en app.routes.ts).
  ruta: string;
  titulo: string;
  // Nombre del ícono del sprite SVG de index.html (id "ic-<icono>").
  icono: string;
  descripcion: string;
  // Roles que pueden ver (y abrir) este módulo.
  roles: string[];
  // Token de color de identidad del módulo (--mod-*, definido en
  // styles.css) — se liga a --acento-modulo en la tarjeta vía
  // [style.--acento-modulo], mismo color que usa el encabezado de ese
  // módulo al abrirlo (ver ":host { --acento-modulo: ... }" en cada
  // componente) para que la tarjeta "avise" de qué color será la pantalla.
  colorVar: string;
}

// Cada módulo declara qué roles pueden verlo, con los mismos permisos que
// ya aplica el backend (ver core/auth-guard.ts y las rutas del API). El
// administrador siempre ve todo lo que existe hoy en el sistema.
//
// ORDEN (2026-10-16, reorganizado a petición del usuario): antes de esto
// el orden era puramente cronológico (el orden en que se construyó cada
// módulo, Sprint por Sprint); ahora agrupa por TEMA, para que los módulos
// relacionados queden contiguos en la rejilla (que los pinta en orden de
// lectura, fila por fila — ver `modulosVisibles`, un simple `.filter()`
// que conserva el orden de este arreglo):
//   1-5  Ventas y caja    — la operación del día a día en el mostrador y
//        por teléfono. Ventas especiales (2026-10-22) se agregó al final de
//        este grupo — es agendar/cotizar, no una venta ya cobrada, pero
//        sigue siendo la misma operación de atender a un cliente.
//   6-8  Cocina e inventario — lo que sostiene lo que se vende (receta →
//        insumo → merma).
//   9-12 Personas         — empleados (Usuarios, Asistencias, Nómina) y
//        clientes. Nómina (2026-10-22) se agregó junto a Asistencias — es
//        el mismo dominio (personal), solo que mira el pago en vez del
//        reloj.
//   13   Finanzas         — Gastos generales (2026-10-28), su propio grupo
//        de un solo módulo: no es "personas" ni "ventas y caja" (se
//        mantiene aparte de Caja a propósito, ver routes/gastos.js), va
//        justo antes de Reportes porque es lo que Reportes/Rentabilidad
//        termina sintetizando.
// Para el cajero (ve 1, 2, 3 y 5) y el auxiliar (solo ve 2) esto no cambia
// casi nada — esos módulos ya eran los primeros antes de este
// reordenamiento, Ventas especiales es la única incorporación nueva al
// menú del cajero.
const MODULOS: Modulo[] = [
  // ---- Ventas y caja ----
  {
    ruta: '/pos',
    titulo: 'Punto de venta',
    icono: 'bolsa',
    descripcion: 'Menú, carrito y cobro.',
    roles: ['administrador', 'encargado', 'cajero'],
    colorVar: 'var(--mod-pos)',
  },
  {
    ruta: '/comandas',
    titulo: 'Comandas',
    icono: 'comanda',
    descripcion: 'Pedidos en preparación y por entregar.',
    roles: ['administrador', 'encargado', 'cajero', 'auxiliar'],
    colorVar: 'var(--mod-comandas)',
  },
  {
    ruta: '/caja',
    titulo: 'Corte de caja',
    icono: 'billetes',
    descripcion: 'Resumen del día y registrar corte.',
    roles: ['administrador', 'encargado', 'cajero'],
    colorVar: 'var(--mod-caja)',
  },
  {
    ruta: '/ventas',
    titulo: 'Ventas',
    icono: 'recibo',
    descripcion: 'Consulta de tickets, filtros y cancelación.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-ventas)',
  },
  {
    ruta: '/ventas-especiales',
    titulo: 'Ventas especiales',
    icono: 'regalo',
    descripcion: 'Agendar y cotizar desayunos, comidas y sorpresas.',
    roles: ['administrador', 'encargado', 'cajero'],
    colorVar: 'var(--mod-ventas-especiales)',
  },
  // ---- Cocina e inventario ----
  {
    ruta: '/recetario',
    titulo: 'Recetario',
    icono: 'cocinar',
    descripcion: 'Insumos que lleva cada variante.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-recetario)',
  },
  {
    ruta: '/inventario',
    titulo: 'Inventario',
    icono: 'paquete',
    descripcion: 'Insumos, existencias y proveedores.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-inventario)',
  },
  {
    ruta: '/mermas',
    titulo: 'Mermas',
    icono: 'picante',
    descripcion: 'Reporte de producto e insumo perdidos.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-mermas)',
  },
  // ---- Personas: empleados y clientes ----
  {
    ruta: '/usuarios',
    titulo: 'Usuarios',
    icono: 'usuarios',
    descripcion: 'Cuentas, roles y permisos.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-usuarios)',
  },
  {
    ruta: '/asistencias',
    titulo: 'Asistencias',
    icono: 'reloj',
    descripcion: 'Personal, entradas, salidas e historial.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-asistencias)',
  },
  {
    ruta: '/nomina',
    titulo: 'Nómina',
    icono: 'calculadora',
    descripcion: 'Pago del personal por horas trabajadas.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-nomina)',
  },
  {
    ruta: '/clientes',
    titulo: 'Clientes',
    icono: 'corazon',
    descripcion: 'Catálogo de clientes y su historial de lealtad.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-clientes)',
  },
  // ---- Finanzas: renta, servicios, mantenimiento — deliberadamente aparte
  // de Caja (ver routes/gastos.js para la decisión de alcance completa).
  {
    ruta: '/gastos',
    titulo: 'Gastos',
    icono: 'gastos',
    descripcion: 'Renta, servicios, mantenimiento y otros gastos generales.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-gastos)',
  },
  // ---- Transversal: no pertenece a ninguno de los 3 grupos de arriba,
  // junta datos de todos ellos (RF-26) — por eso va al final, no mezclado
  // con un grupo específico.
  {
    ruta: '/reportes',
    titulo: 'Reportes',
    icono: 'grafica',
    descripcion: 'Resumen de ventas, inventario, personal y clientes.',
    roles: ['administrador', 'encargado'],
    colorVar: 'var(--mod-reportes)',
  },
  // Checklist (2026-10-16, entrevista: "aunque parece sencillo, es clave
  // para la operación diaria") — también transversal, pero visible a TODO
  // rol operativo (cualquiera puede abrir/cerrar), no solo admin/encargado.
  {
    ruta: '/checklist',
    titulo: 'Checklist',
    icono: 'check',
    descripcion: 'Pasos de apertura y cierre del negocio.',
    roles: ['administrador', 'encargado', 'cajero', 'auxiliar'],
    colorVar: 'var(--mod-checklist)',
  },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class DashboardComponent implements OnInit {
  // Solo los módulos cuyo listado de roles incluye el rol del usuario en
  // sesión. Se recalcula solo si cambia el usuario. Si no hay rol (o ningún
  // módulo lo incluye) la plantilla muestra el mensaje de "sin módulos".
  modulosVisibles = computed(() => {
    const rol = this.authService.usuarioActual()?.rol;
    return MODULOS.filter((modulo) => rol && modulo.roles.includes(rol));
  });

  // Aviso en la tarjeta de Recetario (2026-10-09): cuántas variantes activas
  // todavía no tienen receta capturada. Una variante sin receta es un
  // estado VÁLIDO (ver routes/recetas.js) — no bloquea nada, se puede
  // vender igual — pero significa que venderla no descuenta ningún insumo
  // del inventario, en silencio. Antes solo se veía ese conteo si alguien
  // entraba a Recetario a buscarlo; ahora aparece aquí mismo para que no
  // haga falta acordarse de ir a revisar.
  variantesSinRecetaCount = signal<number | null>(null);

  // ---- Resumen de hoy (franja arriba de la rejilla de módulos) ----
  rol = computed(() => this.authService.usuarioActual()?.rol ?? null);
  // Mismos roles que ya puede consultar GET /api/caja/resumen en el servidor.
  puedeVerResumenCaja = computed(() =>
    ['administrador', 'encargado', 'cajero'].includes(this.rol() ?? ''),
  );
  // Mismos roles que ya puede consultar GET /api/asistencias/hoy en el servidor.
  puedeVerPersonalEnTurno = computed(() =>
    ['administrador', 'encargado'].includes(this.rol() ?? ''),
  );

  // "Ventas de hoy" en la plantilla se calcula directo de resumenCaja()
  // (ventas_efectivo + total_transferencia) en vez de un computed aparte —
  // a diferencia de `total_sistema`, que mezcla las ventas con saldo
  // inicial/ingresos/retiros de caja (ver routes/caja.js, resumenCajaDelDia),
  // esto es la cifra de ventas "limpia" para la tarjeta de un vistazo.
  resumenCaja = signal<ResumenCaja | null>(null);

  personalEnTurnoHoy = signal<number | null>(null);

  constructor(
    // `public` para que la plantilla muestre el nombre/rol y llame a logout().
    public authService: AuthService,
    public themeService: ThemeService,
    private recetasService: RecetasService,
    private cajaService: CajaService,
    private asistenciasService: AsistenciasService,
  ) {}

  ngOnInit(): void {
    // Solo administrador/encargado ven el módulo Recetario (y pueden
    // consultar GET /api/recetas) — para los demás roles la llamada daría
    // 403, así que ni se intenta.
    const rol = this.authService.usuarioActual()?.rol;
    if (rol === 'administrador' || rol === 'encargado') {
      this.cargarVariantesSinReceta();
    }
    if (this.puedeVerResumenCaja()) {
      this.cargarResumenCaja();
    }
    if (this.puedeVerPersonalEnTurno()) {
      this.cargarPersonalEnTurno();
    }
  }

  cargarVariantesSinReceta(): void {
    this.recetasService.listarVariantes().subscribe({
      next: (variantes) => {
        // Solo cuenta las que de verdad necesitan receta (2026-10-22) — una
        // bebida embotellada sin receta capturada no es una alerta real.
        this.variantesSinRecetaCount.set(
          variantes.filter((v) => !v.tiene_receta && v.requiere_preparacion).length,
        );
      },
      error: () => {
        // El badge simplemente no aparece; el resto del dashboard sigue
        // funcionando con normalidad.
      },
    });
  }

  cargarResumenCaja(): void {
    this.cajaService.obtenerResumen().subscribe({
      next: (resumen) => this.resumenCaja.set(resumen),
      error: () => {
        // La franja de resumen simplemente no aparece; el resto del
        // dashboard sigue funcionando con normalidad.
      },
    });
  }

  cargarPersonalEnTurno(): void {
    // "En turno ahora" = tiene una entrada de hoy sin salida todavía (mismo
    // criterio que ya usa asistencias.ts para su tarjeta-resumen "Hoy").
    this.asistenciasService.listarHoy().subscribe({
      next: (asistencias) => {
        this.personalEnTurnoHoy.set(asistencias.filter((a) => !a.hora_salida).length);
      },
      error: () => {
        // El dato simplemente no aparece.
      },
    });
  }
}
