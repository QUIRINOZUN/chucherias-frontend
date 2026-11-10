// Cliente del agente local de impresión (carpeta chucherias-impresora).
// El agente corre en la computadora con la impresora térmica conectada por
// USB y recibe el texto del ticket para imprimirlo con ESC/POS (acentos y
// corte). Si no está encendido, el POS cae al diálogo de impresión normal.
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ImpresoraService {
  private readonly url = 'http://127.0.0.1:9101';

  // Manda el texto a la impresora. Lanza error si el agente no responde o
  // si la impresora falla.
  async imprimirTexto(texto: string): Promise<void> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.url}/imprimir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('AGENTE_APAGADO');
    }
    if (!respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => ({}));
      throw new Error(cuerpo.error || 'La impresora no respondió.');
    }
  }
}
