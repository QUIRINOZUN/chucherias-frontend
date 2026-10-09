// =============================================================================
// recetario/recetario.ts — GESTIÓN DEL RECETARIO (insumos por variante) +
// GESTIÓN DEL MENÚ (categorías, productos, variantes — 2026-10-09)
// =============================================================================
// Pantalla "Recetario". Solo administrador y encargado (igual que Inventario
// — es información de negocio/cocina, no operación de mostrador). Dos
// pestañas (pestanaActiva):
//
//   1. RECETAS (ya existía): lista las variantes del menú agrupadas por
//      categoría → producto (igual orden que ya trae GET /api/productos),
//      cada una con una insignia de cuántos insumos lleva su receta, o "Sin
//      receta" si todavía no tiene. Un buscador por texto filtra por nombre
//      de producto o de variante. Tocar una variante abre un formulario
//      (ventana emergente) con sus líneas de receta (insumo + cantidad); se
//      puede agregar o quitar líneas y "Guardar receta" reemplaza TODA la
//      receta de esa variante de una vez (igual patrón de reemplazo
//      completo que ya usa horarios.ts). La unidad de cada línea es SIEMPRE
//      la unidad base del insumo elegido (se autocompleta y no se puede
//      editar): el servidor nunca convierte unidades al descontar
//      inventario (ver utils/inventarioOrden.js), así que permitir otra
//      unidad aquí produciría un descuento mal escalado en silencio.
//
//   2. MENÚ (nueva): el usuario notó que las categorías ("ALITAS", en
//      mayúsculas por CSS) eran fijas — solo existían las que cargó
//      scripts/seed-catalogo.js, sin forma de crear, renombrar o eliminar
//      una desde la app, ni de dar de alta/editar/activar-desactivar/
//      eliminar productos o variantes. Esta pestaña cubre eso:
//      Categorías (crear/renombrar/eliminar si no tiene productos),
//      Productos agrupados por categoría (crear/editar/activar-desactivar/
//      eliminar si no tiene variantes) y, dentro de cada producto, sus
//      Variantes (crear/editar nombre y precio/activar-desactivar/eliminar
//      si no tiene ventas registradas — ver routes/catalogo.js para el
//      detalle exacto de qué bloquea cada eliminación). Activar/desactivar
//      es el camino normal para "retirar" algo del menú sin perder su
//      historial; eliminar es la excepción, para algo que nunca se vendió.
// =============================================================================
import { Component, OnInit, computed, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { ThemeService } from '../core/theme';
import { LineaRecetaForm, RecetasService, VarianteConReceta } from '../core/recetas';
import { Insumo, InsumosService } from '../core/insumos';
import { CatalogoService, Categoria, Producto, Variante } from '../core/catalogo';

// Línea de receta tal como vive en el formulario (antes de guardarse).
interface LineaFormulario {
  insumo_id: number | null;
  cantidad: number | null;
  unidad_medida: string;
}

interface GrupoProducto {
  producto_id: number;
  producto_nombre: string;
  variantes: VarianteConReceta[];
}

interface GrupoCategoria {
  categoria: string;
  productos: GrupoProducto[];
}

// Productos (con sus variantes) agrupados por categoría, para la pestaña
// "Menú" — distinto de GrupoCategoria/GrupoProducto de arriba porque aquí
// cada Producto ya trae sus Variantes anidadas (viene así de
// CatalogoService), no hace falta un nivel intermedio.
interface GrupoCategoriaMenu {
  categoriaId: number;
  categoria: string;
  productos: Producto[];
}

type ModoFormularioCategoria = 'crear' | 'editar' | null;
type ModoFormularioProducto = 'crear' | 'editar' | null;
type ModoFormularioVariante = 'crear' | 'editar' | null;

@Component({
  selector: 'app-recetario',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './recetario.html',
  styleUrl: './recetario.css',
})
export class RecetarioComponent implements OnInit {
  pestanaActiva = signal<'recetas' | 'menu'>('recetas');

  cambiarPestana(pestana: 'recetas' | 'menu'): void {
    this.pestanaActiva.set(pestana);
  }

  variantes = signal<VarianteConReceta[]>([]);
  insumos = signal<Insumo[]>([]);
  cargando = signal(true);
  error = signal('');
  busqueda = signal('');

  totalConReceta = computed(() => this.variantes().filter((v) => v.tiene_receta).length);
  totalSinReceta = computed(() => this.variantes().length - this.totalConReceta());

  // Estado de receta (tiene_receta/total_insumos) por variante, tal como lo
  // da GET /api/recetas — se usa para enriquecer la estructura de categoría
  // → producto → variante de abajo, que ahora viene de catalogoService (no
  // de recetasService) para que un producto o categoría SIN variantes
  // todavía no desaparezca de esta pestaña (ver nota 2026-10-09 abajo).
  private recetaInfoPorVariante = computed(() => {
    const mapa = new Map<
      number,
      { tiene_receta: boolean; total_insumos: number; tiene_tutorial: boolean; total_pasos: number }
    >();
    for (const v of this.variantes()) {
      mapa.set(v.variante_id, {
        tiene_receta: v.tiene_receta,
        total_insumos: v.total_insumos,
        tiene_tutorial: v.tiene_tutorial,
        total_pasos: v.total_pasos,
      });
    }
    return mapa;
  });

  // Agrupa por categoría → producto → variante, a partir del catálogo
  // completo (categorias() + productosMenu(), ya cargados para la pestaña
  // "Menú" — no hace falta pedirlos otra vez). ANTES esto se armaba
  // iterando solo las variantes que devuelve GET /api/recetas, así que una
  // categoría o producto recién creado SIN NINGUNA variante todavía
  // desaparecía por completo de esta pestaña, aunque sí existiera (bug de
  // diseño detectado por el usuario: creó la categoría "A1" con el
  // producto "juan" adentro y no aparecían aquí hasta que "juan" tuviera
  // su primera variante). Ahora cada categoría y cada producto activos SE
  // MUESTRAN siempre que no haya búsqueda activa, aunque todavía no tengan
  // nada adentro — con un aviso en vez de una lista vacía — y solo se
  // ocultan cuando el texto buscado no calza con nada dentro.
  grupos = computed<GrupoCategoria[]>(() => {
    const texto = this.busqueda().trim().toLowerCase();
    const recetaInfo = this.recetaInfoPorVariante();
    const grupos: GrupoCategoria[] = [];

    for (const categoria of this.categorias()) {
      const productosDeCategoria = this.productosMenu().filter(
        (p) => p.categoria_id === categoria.id && p.activo,
      );
      const gruposProducto: GrupoProducto[] = [];

      for (const producto of productosDeCategoria) {
        const nombreProductoCalza = producto.nombre.toLowerCase().includes(texto);
        const variantesConReceta: VarianteConReceta[] = producto.variantes
          .filter((v) => !texto || nombreProductoCalza || v.nombre.toLowerCase().includes(texto))
          .map((v) => ({
            variante_id: v.id,
            variante_nombre: v.nombre,
            precio: v.precio,
            producto_id: producto.id,
            producto_nombre: producto.nombre,
            categoria: categoria.nombre,
            tiene_receta: recetaInfo.get(v.id)?.tiene_receta ?? false,
            total_insumos: recetaInfo.get(v.id)?.total_insumos ?? 0,
            tiene_tutorial: recetaInfo.get(v.id)?.tiene_tutorial ?? false,
            total_pasos: recetaInfo.get(v.id)?.total_pasos ?? 0,
          }));

        // Con búsqueda activa, un producto sin ninguna coincidencia (ni su
        // nombre, ni ninguna de sus variantes) se omite por completo —
        // mismo comportamiento de filtrado que ya había antes.
        if (texto && variantesConReceta.length === 0 && !nombreProductoCalza) {
          continue;
        }
        gruposProducto.push({
          producto_id: producto.id,
          producto_nombre: producto.nombre,
          variantes: variantesConReceta,
        });
      }

      // Categoría sin ningún producto (visible) todavía: se omite solo si
      // hay una búsqueda activa (no tiene sentido mostrar un encabezado
      // vacío en medio de un filtrado); sin búsqueda, se muestra siempre,
      // con su propio aviso en la plantilla.
      if (texto && gruposProducto.length === 0) {
        continue;
      }
      grupos.push({ categoria: categoria.nombre, productos: gruposProducto });
    }
    return grupos;
  });

  // ---- Editor de receta (ventana emergente) ----
  varianteEditando = signal<VarianteConReceta | null>(null);
  lineasForm = signal<LineaFormulario[]>([]);
  cargandoReceta = signal(false);
  guardando = signal(false);
  errorForm = signal('');

  // Tutorial de elaboración (2026-10-09): pasos numerados en el orden de
  // preparación, editados en el mismo formulario que los insumos de la
  // receta — se guardan los dos con el mismo botón "Guardar receta".
  pasosTutorialForm = signal<string[]>([]);

  constructor(
    private recetasService: RecetasService,
    private insumosService: InsumosService,
    private catalogoService: CatalogoService,
    public themeService: ThemeService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargarVariantes();
    this.cargarInsumos();
    this.cargarMenu();
  }

  cargarVariantes(): void {
    this.cargando.set(true);
    this.recetasService.listarVariantes().subscribe({
      next: (variantes) => {
        this.variantes.set(variantes);
        this.cargando.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el recetario.');
        this.cargando.set(false);
      },
    });
  }

  cargarInsumos(): void {
    this.insumosService.listar().subscribe({
      next: (insumos) => this.insumos.set(insumos),
      error: () => {
        // El selector de insumos del formulario simplemente queda vacío; el
        // resto de la pantalla sigue funcionando.
      },
    });
  }

  // ---- Editor ----

  abrirEditor(variante: VarianteConReceta): void {
    this.varianteEditando.set(variante);
    this.errorForm.set('');
    this.cargandoReceta.set(true);
    this.lineasForm.set([]);
    this.pasosTutorialForm.set([]);

    this.recetasService.obtenerReceta(variante.variante_id).subscribe({
      next: (lineas) => {
        this.lineasForm.set(
          lineas.map((l) => ({
            insumo_id: l.insumo_id,
            cantidad: l.cantidad,
            unidad_medida: l.unidad_medida,
          })),
        );
        this.cargandoReceta.set(false);
      },
      error: () => {
        this.errorForm.set('No se pudo cargar la receta de esta variante.');
        this.cargandoReceta.set(false);
      },
    });

    this.recetasService.obtenerTutorial(variante.variante_id).subscribe({
      next: (pasos) => this.pasosTutorialForm.set(pasos.map((p) => p.descripcion)),
      error: () => {
        // El tutorial simplemente queda vacío; no bloquea el resto del
        // editor (insumos se cargan en una petición aparte, arriba).
      },
    });
  }

  cerrarEditor(): void {
    this.varianteEditando.set(null);
  }

  agregarLinea(): void {
    this.lineasForm.update((lineas) => [
      ...lineas,
      { insumo_id: null, cantidad: null, unidad_medida: '' },
    ]);
  }

  quitarLinea(index: number): void {
    this.lineasForm.update((lineas) => lineas.filter((_, i) => i !== index));
  }

  // Los insumos ya elegidos en OTRA línea no se ofrecen de nuevo (evita
  // repetir el mismo insumo dos veces); la propia línea sigue viendo su
  // insumo actual entre las opciones.
  insumosDisponiblesPara(index: number): Insumo[] {
    const usadosEnOtras = new Set(
      this.lineasForm()
        .filter((_, i) => i !== index)
        .map((l) => l.insumo_id)
        .filter((id): id is number => id !== null),
    );
    return this.insumos().filter((i) => !usadosEnOtras.has(i.id));
  }

  // Al elegir insumo se autocompleta su unidad base — ver nota del
  // encabezado sobre por qué no se deja editar.
  actualizarInsumoLinea(index: number, insumoId: number | null): void {
    const insumo = insumoId ? this.insumos().find((i) => i.id === insumoId) : undefined;
    this.lineasForm.update((lineas) =>
      lineas.map((linea, i) =>
        i === index
          ? { ...linea, insumo_id: insumoId, unidad_medida: insumo?.unidad_medida ?? '' }
          : linea,
      ),
    );
  }

  actualizarCantidadLinea(index: number, valor: string): void {
    const cantidad = valor === '' ? null : Number(valor);
    this.lineasForm.update((lineas) =>
      lineas.map((linea, i) =>
        i === index ? { ...linea, cantidad: Number.isFinite(cantidad) ? cantidad : null } : linea,
      ),
    );
  }

  puedeGuardar(): boolean {
    if (this.guardando() || this.cargandoReceta()) {
      return false;
    }
    const insumosValidos = this.lineasForm().every(
      (l) => l.insumo_id !== null && l.cantidad !== null && l.cantidad > 0,
    );
    const pasosValidos = this.pasosTutorialForm().every((p) => p.trim().length > 0);
    return insumosValidos && pasosValidos;
  }

  // ---- Tutorial de elaboración ----
  // El orden del arreglo ES el orden de preparación — agregar/quitar/mover un
  // paso reordena los demás solos (se renumeran al guardar, ver
  // PUT .../tutorial en el backend).

  agregarPasoTutorial(): void {
    this.pasosTutorialForm.update((pasos) => [...pasos, '']);
  }

  quitarPasoTutorial(index: number): void {
    this.pasosTutorialForm.update((pasos) => pasos.filter((_, i) => i !== index));
  }

  actualizarPasoTutorial(index: number, valor: string): void {
    this.pasosTutorialForm.update((pasos) => pasos.map((p, i) => (i === index ? valor : p)));
  }

  moverPasoArriba(index: number): void {
    if (index === 0) {
      return;
    }
    this.pasosTutorialForm.update((pasos) => {
      const copia = [...pasos];
      [copia[index - 1], copia[index]] = [copia[index], copia[index - 1]];
      return copia;
    });
  }

  moverPasoAbajo(index: number): void {
    this.pasosTutorialForm.update((pasos) => {
      if (index >= pasos.length - 1) {
        return pasos;
      }
      const copia = [...pasos];
      [copia[index + 1], copia[index]] = [copia[index], copia[index + 1]];
      return copia;
    });
  }

  guardar(): void {
    const variante = this.varianteEditando();
    if (!variante || !this.puedeGuardar()) {
      return;
    }
    this.guardando.set(true);
    this.errorForm.set('');

    const payloadInsumos: LineaRecetaForm[] = this.lineasForm().map((l) => ({
      insumo_id: l.insumo_id!,
      cantidad: l.cantidad!,
      unidad_medida: l.unidad_medida,
    }));
    const payloadPasos = this.pasosTutorialForm().map((p) => p.trim());

    // Dos llamadas encadenadas (insumos y tutorial son endpoints separados,
    // no hay una transacción conjunta en el servidor) — mismo patrón de
    // "ya se guardó una parte, pero la otra falló" que ya usa la creación
    // guiada de producto+variante en la pestaña Menú.
    this.recetasService.guardarReceta(variante.variante_id, payloadInsumos).subscribe({
      next: () => {
        this.recetasService.guardarTutorial(variante.variante_id, payloadPasos).subscribe({
          next: () => {
            this.guardando.set(false);
            this.cerrarEditor();
            this.cargarVariantes();
          },
          error: (error: HttpErrorResponse) => {
            this.guardando.set(false);
            this.errorForm.set(
              error.error?.error ||
                'Los insumos se guardaron, pero no se pudo guardar el tutorial.',
            );
          },
        });
      },
      error: (error: HttpErrorResponse) => {
        this.guardando.set(false);
        this.errorForm.set(error.error?.error || 'No se pudo guardar la receta.');
      },
    });
  }

  // =====================================================================
  // MENÚ — categorías, productos y variantes (2026-10-09)
  // =====================================================================
  categorias = signal<Categoria[]>([]);
  // Con incluirInactivos=true: trae también productos/variantes
  // desactivados, para poder reactivarlos desde aquí.
  productosMenu = signal<Producto[]>([]);
  cargandoMenu = signal(true);
  errorMenu = signal('');

  cargarMenu(): void {
    this.cargandoMenu.set(true);
    this.errorMenu.set('');
    this.catalogoService.obtenerCategorias().subscribe({
      next: (categorias) => this.categorias.set(categorias),
      error: () => {
        // La lista de categorías del formulario de producto simplemente
        // queda vacía; el resto de la pestaña sigue funcionando.
      },
    });
    this.catalogoService.obtenerProductos(true).subscribe({
      next: (productos) => {
        this.productosMenu.set(productos);
        this.cargandoMenu.set(false);
      },
      error: () => {
        this.errorMenu.set('No se pudo cargar el menú.');
        this.cargandoMenu.set(false);
      },
    });
  }

  // Sub-pestañas DENTRO de "Menú" (2026-10-09): antes categorías y
  // productos iban apilados en un solo scroll largo, con cada producto
  // mostrando de entrada su descripción, sus 3 botones y la lista completa
  // de variantes (cada una con sus propios 3 botones) — con ~70 productos
  // reales eso es demasiado de golpe. Mismo criterio de sub-pestañas que ya
  // usa Horarios (Calendario/Horas trabajadas): una cosa a la vez.
  subPestanaMenu = signal<'categorias' | 'productos'>('categorias');

  cambiarSubPestanaMenu(sub: 'categorias' | 'productos'): void {
    this.subPestanaMenu.set(sub);
  }

  // Buscador de la pestaña "Menú" (independiente de `busqueda`, que es de
  // la pestaña "Recetas") — filtra por nombre de producto.
  busquedaMenu = signal('');

  // Productos agrupados por categoría, en el mismo orden en que ya llegan
  // (categoría, producto) — incluye categorías sin ningún producto todavía
  // NO, porque se arma a partir de productosMenu(); una categoría recién
  // creada y vacía se ve en la lista de "Categorías", no aquí.
  gruposMenu = computed<GrupoCategoriaMenu[]>(() => {
    const texto = this.busquedaMenu().trim().toLowerCase();
    const grupos: GrupoCategoriaMenu[] = [];
    for (const producto of this.productosMenu()) {
      if (texto && !producto.nombre.toLowerCase().includes(texto)) {
        continue;
      }
      let grupo = grupos.find((g) => g.categoriaId === producto.categoria_id);
      if (!grupo) {
        grupo = {
          categoriaId: producto.categoria_id,
          categoria: producto.categoria,
          productos: [],
        };
        grupos.push(grupo);
      }
      grupo.productos.push(producto);
    }
    return grupos;
  });

  // ---- Ventana de detalle de un producto (2026-10-09) ----
  // Antes cada producto se veía siempre completamente desplegado (nombre,
  // descripción, acciones, Y la lista entera de sus variantes con las
  // suyas) dentro de la lista — mismo problema que ya se había resuelto
  // una vez en el POS ("Detalle de producto en ventana en vez de
  // desplegado en la tarjeta", ver CLAUDE.md): se sentía saturado y
  // desacomodaba las tarjetas vecinas. Ahora la lista solo muestra una fila
  // compacta por producto; tocarla abre esta ventana con todo el detalle.
  // Se guarda solo el ID (no el objeto) y se deriva de productosMenu() con
  // un computed, para que la ventana siempre refleje datos frescos después
  // de cualquier acción (editar, activar, eliminar una variante, etc.) sin
  // tener que sincronizarla a mano — y para que se cierre sola si el
  // producto que estaba viendo se llega a eliminar (el .find() ya no lo
  // encontraría).
  productoDetalleId = signal<number | null>(null);

  productoDetalle = computed<Producto | null>(
    () => this.productosMenu().find((p) => p.id === this.productoDetalleId()) ?? null,
  );

  abrirDetalleProducto(producto: Producto): void {
    this.productoDetalleId.set(producto.id);
  }

  cerrarDetalleProducto(): void {
    this.productoDetalleId.set(null);
  }

  // ---- Categorías: crear / renombrar / eliminar ----
  modoFormularioCategoria = signal<ModoFormularioCategoria>(null);
  categoriaEditandoId = signal<number | null>(null);
  nombreCategoriaForm = signal('');
  procesandoCategoria = signal(false);
  errorFormularioCategoria = signal('');

  abrirCreacionCategoria(): void {
    this.modoFormularioCategoria.set('crear');
    this.categoriaEditandoId.set(null);
    this.nombreCategoriaForm.set('');
    this.errorFormularioCategoria.set('');
  }

  abrirEdicionCategoria(categoria: Categoria): void {
    this.modoFormularioCategoria.set('editar');
    this.categoriaEditandoId.set(categoria.id);
    this.nombreCategoriaForm.set(categoria.nombre);
    this.errorFormularioCategoria.set('');
  }

  cerrarFormularioCategoria(): void {
    this.modoFormularioCategoria.set(null);
  }

  puedeGuardarCategoria(): boolean {
    return !this.procesandoCategoria() && this.nombreCategoriaForm().trim().length > 0;
  }

  guardarFormularioCategoria(): void {
    if (!this.puedeGuardarCategoria()) {
      return;
    }
    this.procesandoCategoria.set(true);
    this.errorFormularioCategoria.set('');
    const nombre = this.nombreCategoriaForm().trim();

    const peticion =
      this.modoFormularioCategoria() === 'crear'
        ? this.catalogoService.crearCategoria(nombre)
        : this.catalogoService.editarCategoria(this.categoriaEditandoId()!, nombre);

    peticion.subscribe({
      next: () => {
        this.procesandoCategoria.set(false);
        this.modoFormularioCategoria.set(null);
        this.cargarMenu();
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoCategoria.set(false);
        this.errorFormularioCategoria.set(
          error.error?.error || 'Ocurrió un error al guardar la categoría.',
        );
      },
    });
  }

  categoriaAEliminar = signal<Categoria | null>(null);
  eliminandoCategoria = signal(false);
  errorEliminarCategoria = signal('');

  abrirConfirmarEliminarCategoria(categoria: Categoria): void {
    this.categoriaAEliminar.set(categoria);
    this.errorEliminarCategoria.set('');
  }

  cerrarConfirmarEliminarCategoria(): void {
    if (this.eliminandoCategoria()) {
      return;
    }
    this.categoriaAEliminar.set(null);
  }

  confirmarEliminarCategoria(): void {
    const categoria = this.categoriaAEliminar();
    if (!categoria || this.eliminandoCategoria()) {
      return;
    }
    this.eliminandoCategoria.set(true);
    this.errorEliminarCategoria.set('');
    this.catalogoService.eliminarCategoria(categoria.id).subscribe({
      next: () => {
        this.eliminandoCategoria.set(false);
        this.categoriaAEliminar.set(null);
        this.categorias.update((lista) => lista.filter((c) => c.id !== categoria.id));
      },
      error: (error: HttpErrorResponse) => {
        this.eliminandoCategoria.set(false);
        this.errorEliminarCategoria.set(error.error?.error || 'No se pudo eliminar la categoría.');
      },
    });
  }

  // ---- Productos: crear / editar / activar-desactivar / eliminar ----
  modoFormularioProducto = signal<ModoFormularioProducto>(null);
  productoEditandoId = signal<number | null>(null);
  nombreProductoForm = signal('');
  descripcionProductoForm = signal('');
  categoriaIdProductoForm = signal<number | null>(null);
  // Primera variante: SOLO se pide al CREAR (ver nota 2026-10-09 abajo); al
  // editar un producto existente estos dos campos no se usan ni se muestran.
  nombreVarianteInicialForm = signal('');
  precioVarianteInicialForm = signal<number | null>(null);
  procesandoProducto = signal(false);
  errorFormularioProducto = signal('');

  // ---- Foto del producto (Cloudinary, 2026-10-09) ----
  // Al EDITAR un producto que ya existe, elegir un archivo lo sube de
  // inmediato (es una acción propia, como activar/desactivar — no hace
  // falta esperar a "Guardar cambios"). Al CREAR no hay id todavía: el
  // archivo se queda en memoria (archivoImagenForm) y se sube recién
  // después de que el producto y su primera variante ya existan (ver
  // guardarFormularioProducto()).
  archivoImagenForm = signal<File | null>(null);
  // Vista previa: URL local (archivo recién elegido, sin subir) o la URL
  // real ya guardada (al editar un producto que ya tenía foto).
  previsualizacionImagenForm = signal<string | null>(null);
  subiendoImagenProducto = signal(false);
  errorImagenProducto = signal('');

  seleccionarArchivoImagen(event: Event): void {
    const archivo = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.archivoImagenForm.set(archivo);
    this.errorImagenProducto.set('');
    if (!archivo) {
      return;
    }
    const lector = new FileReader();
    lector.onload = () => this.previsualizacionImagenForm.set(lector.result as string);
    lector.readAsDataURL(archivo);

    if (this.modoFormularioProducto() === 'editar' && this.productoEditandoId()) {
      this.subirImagenAhora(this.productoEditandoId()!, archivo);
    }
  }

  private subirImagenAhora(productoId: number, archivo: File): void {
    this.subiendoImagenProducto.set(true);
    this.errorImagenProducto.set('');
    this.catalogoService.subirImagenProducto(productoId, archivo).subscribe({
      next: (producto) => {
        this.subiendoImagenProducto.set(false);
        this.previsualizacionImagenForm.set(producto.imagen_url);
        this.cargarMenu();
      },
      error: (error: HttpErrorResponse) => {
        this.subiendoImagenProducto.set(false);
        this.errorImagenProducto.set(error.error?.error || 'No se pudo subir la imagen.');
      },
    });
  }

  quitarImagenProducto(): void {
    const productoId = this.productoEditandoId();
    if (!productoId || this.subiendoImagenProducto()) {
      return;
    }
    this.subiendoImagenProducto.set(true);
    this.errorImagenProducto.set('');
    this.catalogoService.eliminarImagenProducto(productoId).subscribe({
      next: () => {
        this.subiendoImagenProducto.set(false);
        this.archivoImagenForm.set(null);
        this.previsualizacionImagenForm.set(null);
        this.cargarMenu();
      },
      error: (error: HttpErrorResponse) => {
        this.subiendoImagenProducto.set(false);
        this.errorImagenProducto.set(error.error?.error || 'No se pudo quitar la imagen.');
      },
    });
  }

  // categoriaSugeridaId: al crear desde dentro de un grupo de categoría ya
  // se preselecciona esa misma; al crear desde un botón genérico queda sin
  // elegir.
  abrirCreacionProducto(categoriaSugeridaId: number | null = null): void {
    this.modoFormularioProducto.set('crear');
    this.productoEditandoId.set(null);
    this.nombreProductoForm.set('');
    this.descripcionProductoForm.set('');
    this.categoriaIdProductoForm.set(categoriaSugeridaId ?? this.categorias()[0]?.id ?? null);
    this.nombreVarianteInicialForm.set('');
    this.precioVarianteInicialForm.set(null);
    this.archivoImagenForm.set(null);
    this.previsualizacionImagenForm.set(null);
    this.errorImagenProducto.set('');
    this.errorFormularioProducto.set('');
  }

  abrirEdicionProducto(producto: Producto): void {
    this.modoFormularioProducto.set('editar');
    this.productoEditandoId.set(producto.id);
    this.nombreProductoForm.set(producto.nombre);
    this.descripcionProductoForm.set(producto.descripcion ?? '');
    this.categoriaIdProductoForm.set(producto.categoria_id);
    this.archivoImagenForm.set(null);
    this.previsualizacionImagenForm.set(producto.imagen_url);
    this.errorImagenProducto.set('');
    this.errorFormularioProducto.set('');
  }

  cerrarFormularioProducto(): void {
    this.modoFormularioProducto.set(null);
  }

  // Al CREAR, además de categoría y nombre, exige los datos de la primera
  // variante (nombre + precio > 0) — ver nota 2026-10-09 en
  // guardarFormularioProducto(). Al EDITAR no aplica: la variante es cosa
  // aparte, se administra desde la lista de variantes de ese producto.
  puedeGuardarProducto(): boolean {
    if (this.procesandoProducto()) {
      return false;
    }
    const datosBasicosOk =
      this.nombreProductoForm().trim().length > 0 && !!this.categoriaIdProductoForm();
    if (this.modoFormularioProducto() !== 'crear') {
      return datosBasicosOk;
    }
    const precio = this.precioVarianteInicialForm();
    return (
      datosBasicosOk && this.nombreVarianteInicialForm().trim().length > 0 && !!precio && precio > 0
    );
  }

  // 2026-10-09: antes, crear un producto lo dejaba con 0 variantes — sin
  // ninguna variante no se puede vender, no aparece en el punto de venta y
  // (hasta la corrección de arriba) ni siquiera se veía en "Recetas". El
  // usuario encontró justo este caso de uso incompleto (creó la categoría
  // "A1" con el producto "juan" y no pasó de ahí) y pidió que el formulario
  // fuera explícito sobre qué hace falta para un producto COMPLETO. Ahora
  // "Nuevo producto" exige también el nombre y precio de su primera
  // variante, y las dos peticiones (crear producto, luego crear su
  // variante) se encadenan: si la segunda falla, el producto ya quedó
  // creado (se ve en la lista con "Sin variantes todavía" y se le puede
  // agregar la variante desde ahí) — no se revierte la primera, porque el
  // servidor no ofrece una transacción que abarque ambas llamadas.
  guardarFormularioProducto(): void {
    if (!this.puedeGuardarProducto()) {
      return;
    }
    this.procesandoProducto.set(true);
    this.errorFormularioProducto.set('');

    if (this.modoFormularioProducto() !== 'crear') {
      this.catalogoService
        .editarProducto(this.productoEditandoId()!, {
          categoria_id: this.categoriaIdProductoForm()!,
          nombre: this.nombreProductoForm().trim(),
          descripcion: this.descripcionProductoForm().trim() || null,
        })
        .subscribe({
          next: () => {
            this.procesandoProducto.set(false);
            this.modoFormularioProducto.set(null);
            this.cargarMenu();
          },
          error: (error: HttpErrorResponse) => {
            this.procesandoProducto.set(false);
            this.errorFormularioProducto.set(
              error.error?.error || 'Ocurrió un error al guardar el producto.',
            );
          },
        });
      return;
    }

    this.catalogoService
      .crearProducto({
        categoria_id: this.categoriaIdProductoForm()!,
        nombre: this.nombreProductoForm().trim(),
        descripcion: this.descripcionProductoForm().trim() || undefined,
      })
      .subscribe({
        next: (nuevoProducto) => {
          this.catalogoService
            .crearVariante(
              nuevoProducto.id,
              this.nombreVarianteInicialForm().trim(),
              this.precioVarianteInicialForm()!,
            )
            .subscribe({
              next: () => this.finalizarCreacionProducto(nuevoProducto.id),
              error: (error: HttpErrorResponse) => {
                // El producto SÍ se creó; solo falló su primera variante —
                // se avisa pero no se cierra el formulario como "éxito
                // total" (ver nota de arriba: no hay transacción conjunta).
                this.procesandoProducto.set(false);
                this.cargarMenu();
                this.errorFormularioProducto.set(
                  `El producto se creó, pero la variante no: ${error.error?.error || 'intenta agregarla desde la lista de productos.'}`,
                );
              },
            });
        },
        error: (error: HttpErrorResponse) => {
          this.procesandoProducto.set(false);
          this.errorFormularioProducto.set(
            error.error?.error || 'Ocurrió un error al guardar el producto.',
          );
        },
      });
  }

  // Último paso de "Nuevo producto": si se eligió una foto, se sube ahora
  // que el producto ya existe (no se podía antes, hace falta su id). Igual
  // que con la variante, si esto falla el producto y su variante YA
  // quedaron creados — se avisa en vez de fingir un error total.
  private finalizarCreacionProducto(productoId: number): void {
    const archivo = this.archivoImagenForm();
    if (!archivo) {
      this.procesandoProducto.set(false);
      this.modoFormularioProducto.set(null);
      this.cargarMenu();
      return;
    }
    this.catalogoService.subirImagenProducto(productoId, archivo).subscribe({
      next: () => {
        this.procesandoProducto.set(false);
        this.modoFormularioProducto.set(null);
        this.cargarMenu();
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoProducto.set(false);
        this.cargarMenu();
        this.errorFormularioProducto.set(
          `El producto se creó, pero la foto no se pudo subir: ${error.error?.error || 'intenta subirla editando el producto.'}`,
        );
      },
    });
  }

  actualizandoActivoProductoId = signal<number | null>(null);

  alternarActivoProducto(producto: Producto): void {
    this.actualizandoActivoProductoId.set(producto.id);
    this.catalogoService.cambiarActivoProducto(producto.id, !producto.activo).subscribe({
      next: () => {
        this.actualizandoActivoProductoId.set(null);
        this.cargarMenu();
      },
      error: () => {
        this.actualizandoActivoProductoId.set(null);
        this.errorMenu.set('No se pudo actualizar el estado del producto.');
      },
    });
  }

  productoAEliminar = signal<Producto | null>(null);
  eliminandoProducto = signal(false);
  errorEliminarProducto = signal('');

  abrirConfirmarEliminarProducto(producto: Producto): void {
    this.productoAEliminar.set(producto);
    this.errorEliminarProducto.set('');
  }

  cerrarConfirmarEliminarProducto(): void {
    if (this.eliminandoProducto()) {
      return;
    }
    this.productoAEliminar.set(null);
  }

  confirmarEliminarProducto(): void {
    const producto = this.productoAEliminar();
    if (!producto || this.eliminandoProducto()) {
      return;
    }
    this.eliminandoProducto.set(true);
    this.errorEliminarProducto.set('');
    this.catalogoService.eliminarProducto(producto.id).subscribe({
      next: () => {
        this.eliminandoProducto.set(false);
        this.productoAEliminar.set(null);
        this.cargarMenu();
      },
      error: (error: HttpErrorResponse) => {
        this.eliminandoProducto.set(false);
        this.errorEliminarProducto.set(error.error?.error || 'No se pudo eliminar el producto.');
      },
    });
  }

  // ---- Variantes: crear / editar / activar-desactivar / eliminar ----
  modoFormularioVariante = signal<ModoFormularioVariante>(null);
  varianteEditandoId = signal<number | null>(null);
  // Producto al que pertenece la variante que se está creando/editando —
  // hace falta para POST (la URL lleva el productoId) y para refrescar bien
  // el mensaje de contexto en la ventana.
  productoDeVarianteForm = signal<Producto | null>(null);
  nombreVarianteForm = signal('');
  precioVarianteForm = signal<number | null>(null);
  procesandoVariante = signal(false);
  errorFormularioVariante = signal('');

  abrirCreacionVariante(producto: Producto): void {
    this.modoFormularioVariante.set('crear');
    this.varianteEditandoId.set(null);
    this.productoDeVarianteForm.set(producto);
    this.nombreVarianteForm.set('');
    this.precioVarianteForm.set(null);
    this.errorFormularioVariante.set('');
  }

  abrirEdicionVariante(producto: Producto, variante: Variante): void {
    this.modoFormularioVariante.set('editar');
    this.varianteEditandoId.set(variante.id);
    this.productoDeVarianteForm.set(producto);
    this.nombreVarianteForm.set(variante.nombre);
    this.precioVarianteForm.set(variante.precio);
    this.errorFormularioVariante.set('');
  }

  cerrarFormularioVariante(): void {
    this.modoFormularioVariante.set(null);
  }

  puedeGuardarVariante(): boolean {
    if (this.procesandoVariante()) {
      return false;
    }
    const precio = this.precioVarianteForm();
    return this.nombreVarianteForm().trim().length > 0 && precio !== null && precio > 0;
  }

  guardarFormularioVariante(): void {
    if (!this.puedeGuardarVariante()) {
      return;
    }
    this.procesandoVariante.set(true);
    this.errorFormularioVariante.set('');

    const nombre = this.nombreVarianteForm().trim();
    const precio = this.precioVarianteForm()!;

    const peticion =
      this.modoFormularioVariante() === 'crear'
        ? this.catalogoService.crearVariante(this.productoDeVarianteForm()!.id, nombre, precio)
        : this.catalogoService.editarVariante(this.varianteEditandoId()!, { nombre, precio });

    peticion.subscribe({
      next: () => {
        this.procesandoVariante.set(false);
        this.modoFormularioVariante.set(null);
        this.cargarMenu();
      },
      error: (error: HttpErrorResponse) => {
        this.procesandoVariante.set(false);
        this.errorFormularioVariante.set(
          error.error?.error || 'Ocurrió un error al guardar la variante.',
        );
      },
    });
  }

  actualizandoActivoVarianteId = signal<number | null>(null);

  alternarActivoVariante(variante: Variante): void {
    this.actualizandoActivoVarianteId.set(variante.id);
    this.catalogoService.cambiarActivoVariante(variante.id, !variante.activo).subscribe({
      next: () => {
        this.actualizandoActivoVarianteId.set(null);
        this.cargarMenu();
      },
      error: () => {
        this.actualizandoActivoVarianteId.set(null);
        this.errorMenu.set('No se pudo actualizar el estado de la variante.');
      },
    });
  }

  varianteAEliminar = signal<Variante | null>(null);
  eliminandoVariante = signal(false);
  errorEliminarVariante = signal('');

  abrirConfirmarEliminarVariante(variante: Variante): void {
    this.varianteAEliminar.set(variante);
    this.errorEliminarVariante.set('');
  }

  cerrarConfirmarEliminarVariante(): void {
    if (this.eliminandoVariante()) {
      return;
    }
    this.varianteAEliminar.set(null);
  }

  confirmarEliminarVariante(): void {
    const variante = this.varianteAEliminar();
    if (!variante || this.eliminandoVariante()) {
      return;
    }
    this.eliminandoVariante.set(true);
    this.errorEliminarVariante.set('');
    this.catalogoService.eliminarVariante(variante.id).subscribe({
      next: () => {
        this.eliminandoVariante.set(false);
        this.varianteAEliminar.set(null);
        this.cargarMenu();
      },
      error: (error: HttpErrorResponse) => {
        this.eliminandoVariante.set(false);
        this.errorEliminarVariante.set(error.error?.error || 'No se pudo eliminar la variante.');
      },
    });
  }

  volverAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}
