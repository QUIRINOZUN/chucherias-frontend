import { Injectable, signal } from '@angular/core';

export type Tema = 'dark' | 'light';

const CLAVE_ALMACENAMIENTO = 'tema';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // El script inline en index.html ya aplicó el tema guardado antes de que
  // Angular arrancara; aquí solo sincronizamos el estado reactivo con lo
  // que quedó puesto en <html data-theme="...">.
  tema = signal<Tema>(this.leerTemaActual());

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

  private leerTemaActual(): Tema {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
}
