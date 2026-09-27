// =============================================================================
// core/theme.ts — TEMA CLARO / OSCURO
// =============================================================================
// ThemeService controla qué tema visual está activo. El tema se guarda en dos
// lugares que deben coincidir:
//   1. El atributo `data-theme` de <html>: es lo que hace que el CSS global
//      (styles.css) cambie todos los colores a la vez.
//   2. localStorage['tema']: para recordar la elección entre visitas.
//
// El tema oscuro es el de por defecto. Al cargar la página, un script en línea
// dentro de index.html aplica el tema guardado ANTES de que Angular arranque,
// para evitar un parpadeo del tema equivocado; este servicio solo se
// sincroniza con lo que ese script dejó puesto.
//
// Lo usan todas las pantallas para pintar el botón de sol/luna del encabezado.
// =============================================================================
import { Injectable, signal } from '@angular/core';

export type Tema = 'dark' | 'light';

// Nombre de la clave con la que se guarda el tema en localStorage.
const CLAVE_ALMACENAMIENTO = 'tema';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // El script inline en index.html ya aplicó el tema guardado antes de que
  // Angular arrancara; aquí solo sincronizamos el estado reactivo con lo
  // que quedó puesto en <html data-theme="...">.
  // Es una "signal": las plantillas que la leen (tema()) se actualizan solas
  // cuando cambia.
  tema = signal<Tema>(this.leerTemaActual());

  // Cambia entre oscuro y claro, lo aplica al documento y lo recuerda.
  alternarTema(): void {
    const nuevoTema: Tema = this.tema() === 'dark' ? 'light' : 'dark';
    this.tema.set(nuevoTema);
    document.documentElement.setAttribute('data-theme', nuevoTema);
    try {
      localStorage.setItem(CLAVE_ALMACENAMIENTO, nuevoTema);
    } catch {
      // Almacenamiento no disponible (modo privado, etc.): el tema sigue
      // funcionando para esta sesión, solo no persiste.
    }
  }

  // Lee el tema que el script de index.html dejó en <html data-theme>.
  private leerTemaActual(): Tema {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
}
