import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { HistorialEntry } from '../src/app/components/historial.ts';
import {
  NODES,
  ROOT,
  TOTAL_NODES,
  ZONE_KINDS,
  brainDescription,
  brainState,
  nodeAt,
  parentOf,
} from '../src/app/components/cerebro.ts';

function entry(date: string, kind: string, clientId = `${date}-${kind}`): HistorialEntry {
  return { clientId, date, kind, minutes: 10, note: null, resourceId: null, pending: false };
}

describe('brainState', () => {
  test('sin registros no hay ninguna rama', () => {
    const state = brainState([]);
    assert.equal(state.branches.length, 0);
    assert.equal(state.distinctDays, 0);
  });

  test('cuenta días distintos, no cantidad de registros', () => {
    // Ten entries in one afternoon are one day of encounters, not ten.
    const state = brainState([
      entry('2026-09-19', 'lectura', 'a'),
      entry('2026-09-19', 'lectura', 'b'),
      entry('2026-09-19', 'lectura', 'c'),
    ]);
    assert.equal(state.distinctDays, 1);
    assert.equal(state.branches.length, 1);
    assert.equal(state.byKind.lectura, 1);
  });

  test('un día con dos actividades enciende dos ramas', () => {
    const state = brainState([entry('2026-09-19', 'lectura'), entry('2026-09-19', 'cancion')]);
    assert.equal(state.distinctDays, 1);
    assert.equal(state.branches.length, 2);
    assert.equal(state.byKind.cancion, 1);
  });

  test('las ramas salen en orden cronológico, no en el que llegaron', () => {
    // The drawing grows the way the weeks did, whatever order the queue flushed in.
    const state = brainState([
      entry('2026-09-20', 'juego'),
      entry('2026-09-05', 'lectura'),
      entry('2026-09-12', 'cancion'),
    ]);
    assert.deepEqual(state.branches.map((b) => b.date), ['2026-09-05', '2026-09-12', '2026-09-20']);
  });

  test('nunca retrocede: agregar historia solo agrega ramas', () => {
    const historia = [entry('2026-09-01', 'lectura'), entry('2026-09-02', 'lectura')];
    const antes = brainState(historia);
    const despues = brainState([...historia, entry('2026-09-03', 'juego')]);

    assert.equal(despues.branches.length, antes.branches.length + 1);
    // Everything already drawn keeps its exact position and colour.
    assert.deepEqual(despues.branches.slice(0, antes.branches.length), antes.branches);
  });

  test('se detiene al llegar a la capacidad, sin quitar nada', () => {
    const muchas: HistorialEntry[] = [];
    for (let day = 1; day <= TOTAL_NODES + 20; day += 1) {
      const date = `2026-${String(Math.floor((day - 1) / 28) + 1).padStart(2, '0')}-${String(((day - 1) % 28) + 1).padStart(2, '0')}`;
      muchas.push(entry(date, 'lectura'));
    }
    const state = brainState(muchas);
    assert.equal(state.branches.length, TOTAL_NODES);
    // The count keeps rising even though the drawing is full: the number is not capped, the canvas is.
    assert.ok(state.byKind.lectura > TOTAL_NODES);
  });

  test('una entrada en cola cuenta igual que una guardada', () => {
    // Otherwise the brain would not grow with no signal, which is when it matters most.
    const state = brainState([{ ...entry('2026-09-19', 'lectura'), pending: true }]);
    assert.equal(state.branches.length, 1);
  });

  test('ignora fechas vacías y tipos desconocidos en vez de romperse', () => {
    const state = brainState([entry('', 'lectura'), entry('2026-09-19', 'baile')]);
    assert.equal(state.branches.length, 0);
  });
});

describe('geometría', () => {
  test('hay un nodo por cada día del programa', () => {
    assert.equal(NODES.length, TOTAL_NODES);
    assert.equal(TOTAL_NODES, 56);
  });

  test('todos los nodos caen dentro del lienzo', () => {
    for (const node of NODES) {
      assert.ok(node.x > 4 && node.x < 192, `x fuera de rango: ${node.x}`);
      assert.ok(node.y > 4 && node.y < 168, `y fuera de rango: ${node.y}`);
    }
  });

  test('la red crece hacia afuera: cada rama nace de una anterior', () => {
    // This is what makes it read as irrigation instead of a star burst.
    for (const [index, node] of NODES.entries()) {
      assert.ok(node.parent < index, `el nodo ${index} nace de uno posterior`);
    }
    assert.equal(NODES[0]?.parent, -1, 'la primera nace de la raíz');
  });

  test('cada rama se cuelga de la más cercana ya dibujada', () => {
    for (let index = 1; index < NODES.length; index += 1) {
      const node = NODES[index]!;
      const chosen = NODES[node.parent]!;
      const chosenDistance = (chosen.x - node.x) ** 2 + (chosen.y - node.y) ** 2;
      for (let candidate = 0; candidate < index; candidate += 1) {
        const other = NODES[candidate]!;
        const distance = (other.x - node.x) ** 2 + (other.y - node.y) ** 2;
        assert.ok(distance >= chosenDistance - 1e-9, `hay una más cercana que ${node.parent}`);
      }
    }
  });

  test('los nodos no se encinan unos sobre otros', () => {
    const unicos = new Set(NODES.map((node) => `${node.x},${node.y}`));
    assert.equal(unicos.size, NODES.length);
  });

  test('es determinista: la misma familia ve siempre el mismo cerebro', () => {
    assert.deepEqual(nodeAt(0), NODES[0]);
    assert.deepEqual(parentOf(0), ROOT);
  });

  test('un índice fuera de rango devuelve la raíz en vez de reventar', () => {
    assert.deepEqual(nodeAt(9999), ROOT);
    assert.deepEqual(parentOf(9999), ROOT);
  });
});

describe('brainDescription', () => {
  test('quien no ve el dibujo recibe la misma información', () => {
    const texto = brainDescription(brainState([
      entry('2026-09-19', 'lectura'),
      entry('2026-09-20', 'cancion'),
    ]));
    assert.match(texto, /2 días de encuentros/);
    assert.match(texto, /2 conexiones/);
    assert.match(texto, /lectura 1/);
    assert.match(texto, /canciones 1/);
  });

  test('el estado vacío invita, no reprocha', () => {
    const texto = brainDescription(brainState([]));
    assert.match(texto, /primera aparece/);
    assert.equal(/falta|deber|no has|incumpl|atras/i.test(texto), false);
  });

  test('usa singular cuando corresponde', () => {
    const texto = brainDescription(brainState([entry('2026-09-19', 'lectura')]));
    assert.match(texto, /1 día de encuentros/);
    assert.match(texto, /1 conexión/);
  });

  test('nombra las cuatro actividades del programa', () => {
    assert.deepEqual([...ZONE_KINDS], ['lectura', 'cancion', 'juego', 'conversacion']);
  });
});
