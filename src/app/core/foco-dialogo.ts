// =============================================================================
// core/foco-dialogo.ts — PATRÓN DE DIÁLOGO ACCESIBLE PARA VENTANAS .overlay
// =============================================================================
// Auditoría de accesibilidad (2026-10-13, ver CLAUDE.md): las ~20 ventanas
// .overlay de los 5 módulos principales (pos/recetario/comandas/caja/
// asistencias/inventario/usuarios) no tenían manejo de foco ni rol de
// diálogo — se dejó pendiente por necesitar un patrón reutilizable en vez de
// 20 cambios puntuales. Esta directiva ES ese patrón: se agrega al elemento
// que ya recibe `role="dialog" aria-modal="true"` (el panel de contenido, NO
// el fondo oscuro) y hace tres cosas, estándar de cualquier diálogo (WAI-ARIA
// Authoring Practices):
//   1. Al abrirse, mueve el foco DENTRO del diálogo (su primer elemento
//      enfocable, o el panel mismo si no tiene ninguno).
//   2. Mientras está abierto, ATRAPA el Tab: no se puede tabular hacia algo
//      de atrás de la ventana.
//   3. Al cerrarse, devuelve el foco a donde estaba antes de abrir (el botón
//      que la abrió, normalmente) — sin esto, tras cerrar un diálogo con
//      teclado el foco "se pierde" (vuelve al <body>).
//
// Además emite `cerrarConEscape` para que la tecla Escape cierre la ventana
// igual que ya hace tocar el fondo oscuro — cada plantilla lo liga al mismo
// método que ya usa (click) en `.overlay`.
// =============================================================================
import {
  Directive,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  HostListener,
} from '@angular/core';

const SELECTOR_ENFOCABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

@Directive({
  selector: '[appFocoDialogo]',
  standalone: true,
})
export class FocoDialogoDirective implements OnInit, OnDestroy {
  @Output() cerrarConEscape = new EventEmitter<void>();

  // Qué tenía el foco ANTES de abrirse este diálogo — para devolvérselo al
  // cerrar (ver ngOnDestroy).
  private elementoPrevio: HTMLElement | null = null;

  constructor(private elementoDialogo: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.elementoPrevio = document.activeElement as HTMLElement;
    // Se difiere un tick: el contenido del diálogo (recién creado por el
    // @if que lo muestra) puede no estar pintado todavía en este momento.
    setTimeout(() => this.enfocarPrimerElemento());
  }

  ngOnDestroy(): void {
    // Si el elemento ya no existe (ej. se eliminó de la lista que abrió el
    // diálogo), simplemente no se restaura nada — no es un error.
    this.elementoPrevio?.focus?.();
  }

  private enfocarPrimerElemento(): void {
    const host = this.elementoDialogo.nativeElement;
    const enfocables = host.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES);
    if (enfocables.length > 0) {
      enfocables[0].focus();
    } else {
      // Sin ningún control enfocable adentro (poco común, pero posible en
      // una ventana de solo lectura): el panel mismo recibe el foco.
      host.tabIndex = -1;
      host.focus();
    }
  }

  @HostListener('keydown', ['$event'])
  alTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      this.cerrarConEscape.emit();
      return;
    }
    if (evento.key !== 'Tab') {
      return;
    }

    const host = this.elementoDialogo.nativeElement;
    const enfocables = Array.from(host.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES)).filter(
      (el) => el.offsetParent !== null, // descarta los ocultos (display:none)
    );
    if (enfocables.length === 0) {
      return;
    }

    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];

    // Tab en el último → vuelve al primero; Shift+Tab en el primero →
    // salta al último. Así el foco nunca se "escapa" del diálogo mientras
    // esté abierto.
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }
}
