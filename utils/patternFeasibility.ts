// Checks whether a painted pattern's color grid is physically possible, by
// modeling string continuity as a max-flow problem across the WHOLE row
// sequence at once (not one row-pair at a time). This is the generalization
// of the row-by-row "candidatePositions + color match" idea already used in
// knotInstructions.ts's computeArrows, extended so a string's fate several
// rows ahead can correctly block it, per the cascading-color scenario
// discussed in chat.
//
// GAP-ROW IDLE EDGES - a gap row's two edge positions (isKnot: false) are
// not real ties, just the same string continuing unchanged from the main
// row before to the main row after (see knotInstructions.ts's SEPARATE
// MAIN/GAP ROWS note). Geometrically, candidatePositions always gives an
// idle edge position exactly one neighbor on each side anyway (a gap row is
// always exactly one wider than its neighboring main rows, and the math
// works out so the edge position's only in-bounds candidate is that single
// real neighbor) - so no ambiguity is introduced by connecting it. What
// this exemption actually does is skip the COLOR-MATCH requirement for that
// one connection, since it's a rendering artifact rather than an
// independently painted tie and shouldn't be able to report false
// "infeasible" if its stored color ever drifts from its main-row partner's.
//
// UNIFORM ("WRAP") ROWS - a real technique where one string ties across an
// entire row, becoming that row's visible color everywhere, while every
// other string is carried underneath, hidden and unchanged in position -
// see chat history for why this is indistinguishable from a break using
// displayed color alone. A fully solid-colored row is the reliable,
// detectable signature of this (nothing else produces one), so any such
// row is exempted from the color-match requirement on BOTH sides, the same
// way an idle gap-edge position is - we know from the data alone that a
// real, valid technique explains it, even though we can't see which
// underlying string is which. Known limitation: an almost-solid row (one
// or two deliberately different cells) doesn't qualify and still gets the
// full check - worth testing for once this is validated.
//
// SCOPE OF THIS FIRST VERSION - still simplified beyond the above:
// - Reports feasible when `flow === starting row's width`. Does not yet
//   require every intermediate node to be saturated (relevant for a wider
//   gap row's non-edge, real-knot positions) - a follow-up once this is
//   validated against real patterns.

import { InstructionRow, candidatePositions } from './knotInstructions';

export type FeasibilityResult =
  | { feasible: true; flow: number }
  | {
      feasible: false;
      flow: number;
      expected: number;
      blockedStartPositions: number[];
      orphans: { row: number; position: number }[];
    };

type Edge = { to: string; cap: number; reverseIndex: number };

const SOURCE = 'source';
const SINK = 'sink';
const nodeIn = (r: number, p: number) => `in:${r}:${p}`;
const nodeOut = (r: number, p: number) => `out:${r}:${p}`;

function isUniformRow(colors: (string | null)[]): boolean {
  const painted = colors.filter((c): c is string => c != null);
  if (painted.length === 0) return false;
  return painted.every(c => c === painted[0]);
}

export function checkPatternFeasibility(rows: InstructionRow[]): FeasibilityResult {
  const colors = rows.map(r => r.knots.map(k => k.color));
  const isKnot = rows.map(r => r.knots.map(k => k.isKnot));
  const uniformRow = colors.map(isUniformRow);
  const widths = colors.map(c => c.length);
  const numRows = colors.length;

  const graph = new Map<string, Edge[]>();
  function addNode(id: string) {
    if (!graph.has(id)) graph.set(id, []);
  }
  function addEdge(from: string, to: string, cap: number) {
    addNode(from);
    addNode(to);
    const forward: Edge = { to, cap, reverseIndex: graph.get(to)!.length };
    const backward: Edge = { to: from, cap: 0, reverseIndex: graph.get(from)!.length };
    graph.get(from)!.push(forward);
    graph.get(to)!.push(backward);
  }

  // Node-capacity edges: one physical position can carry exactly one string.
  for (let r = 0; r < numRows; r++) {
    for (let p = 0; p < widths[r]; p++) {
      addEdge(nodeIn(r, p), nodeOut(r, p), 1);
    }
  }

  // Inter-row edges: geometric neighbors with matching color - EXCEPT an
  // idle gap-row edge position (isKnot: false, on either end of the
  // connection), or either row being a uniform/wrap row, always connects to
  // its geometric neighbor(s) regardless of color. See GAP-ROW IDLE EDGES
  // and UNIFORM ("WRAP") ROWS above.
  for (let r = 0; r < numRows - 1; r++) {
    for (let p = 0; p < widths[r]; p++) {
      const color = colors[r][p];
      if (color == null) continue;
      for (const q of candidatePositions(p, widths[r], widths[r + 1])) {
        const isExempt = !isKnot[r][p] || !isKnot[r + 1][q] || uniformRow[r] || uniformRow[r + 1];
        if (isExempt || colors[r + 1][q] === color) {
          addEdge(nodeOut(r, p), nodeIn(r + 1, q), 1);
        }
      }
    }
  }

  // Source feeds every starting position; sink drains every ending position.
  for (let p = 0; p < widths[0]; p++) addEdge(SOURCE, nodeIn(0, p), 1);
  for (let p = 0; p < widths[numRows - 1]; p++) addEdge(nodeOut(numRows - 1, p), SINK, 1);

  // Edmonds-Karp: repeatedly BFS for an augmenting path, push 1 unit of flow.
  let flow = 0;
  while (true) {
    const parent = new Map<string, { node: string; edge: Edge }>();
    const visited = new Set<string>([SOURCE]);
    const queue: string[] = [SOURCE];
    let found = false;

    while (queue.length > 0 && !found) {
      const node = queue.shift()!;
      for (const edge of graph.get(node) ?? []) {
        if (edge.cap > 0 && !visited.has(edge.to)) {
          visited.add(edge.to);
          parent.set(edge.to, { node, edge });
          if (edge.to === SINK) { found = true; break; }
          queue.push(edge.to);
        }
      }
    }

    if (!found) break;

    let cur = SINK;
    while (cur !== SOURCE) {
      const { node, edge } = parent.get(cur)!;
      edge.cap -= 1;
      graph.get(edge.to)![edge.reverseIndex].cap += 1;
      cur = node;
    }
    flow += 1;
  }

  const expected = widths[0];

  // ORPHAN CHECK - closes the gap the "Green" test just caught: flow only
  // ever needs to equal widths[0], so a painted color sitting on a row's
  // extra, unrequired position (present whenever a row is wider than the
  // starting row) was never checked at all if no complete path needed it.
  // A position with literally zero valid edges in EITHER direction has no
  // possible physical explanation regardless of flow count, so it's
  // reported as infeasible even when flow otherwise reaches `expected`.
  // Re-derived straight from the same rules used to build the graph
  // (rather than residual capacities, which reflect flow usage, not
  // existence).
  const orphans: { row: number; position: number }[] = [];
  for (let r = 0; r < numRows; r++) {
    for (let p = 0; p < widths[r]; p++) {
      if (colors[r][p] == null) continue;
      if (!isKnot[r][p]) continue; // idle edges are exempt by definition

      let hasInbound = r === 0;
      if (!hasInbound) {
        for (let prevP = 0; prevP < widths[r - 1] && !hasInbound; prevP++) {
          if (!candidatePositions(prevP, widths[r - 1], widths[r]).includes(p)) continue;
          const isExempt = !isKnot[r - 1][prevP] || !isKnot[r][p] || uniformRow[r - 1] || uniformRow[r];
          if (isExempt || colors[r - 1][prevP] === colors[r][p]) hasInbound = true;
        }
      }

      let hasOutbound = r === numRows - 1;
      if (!hasOutbound) {
        for (const nextP of candidatePositions(p, widths[r], widths[r + 1])) {
          const isExempt = !isKnot[r][p] || !isKnot[r + 1][nextP] || uniformRow[r] || uniformRow[r + 1];
          if (isExempt || colors[r + 1][nextP] === colors[r][p]) { hasOutbound = true; break; }
        }
      }

      if (!hasInbound && !hasOutbound) orphans.push({ row: r, position: p });
    }
  }

  if (flow === expected && orphans.length === 0) return { feasible: true, flow };

  // Source edges still holding capacity (never used) = the starting
  // positions that could not find any complete path through to the end.
  const blockedStartPositions: number[] = [];
  const sourceEdges = graph.get(SOURCE) ?? [];
  for (let p = 0; p < widths[0]; p++) {
    if (sourceEdges[p].cap > 0) blockedStartPositions.push(p);
  }

  return { feasible: false, flow, expected, blockedStartPositions, orphans };
}
