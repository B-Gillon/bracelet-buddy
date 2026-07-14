import React, { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Polygon } from 'react-native-svg';
import { DualGrid } from '../types/pattern';
import { CellInfo, buildCells } from '../utils/diamondGrid';
import { useTheme } from '../context/ThemeContext';

// A diamond that's part of the current selection (before Duplicate/Move is
// clicked) or part of a floating Duplicate/Move copy (after).
export type FloatingCell = { pass: 'main' | 'gap'; r: number; c: number; color: string | null };

// A diamond identified by its logical (not display) coordinates - what
// onBoxSelect hands back up, same shape BuildScreen already keys
// selectedCells by elsewhere.
export type LogicalCell = { pass: 'main' | 'gap'; r: number; c: number };

// Extracted verbatim from BuildScreen.tsx - same props, same behavior, only
// the four color constants now come from the theme instead of local consts.
// selectedCells/floatingCells added for the Select/Duplicate/Move tools -
// both use logical (pass:r:c) coordinates, same space onCellPress/onCellDrag
// already report in, so orientation is handled once here rather than by
// every caller.
//
// boxSelectEnabled/onBoxSelect add rectangle "marquee" selection: dragging
// while it's on draws a live preview rectangle and, on release, reports
// every COLORED diamond (either pass) whose center fell inside it - blank
// diamonds within the box are left out, since there's nothing meaningful to
// select/act on there - rather than the old behavior of onCellDrag firing
// per diamond actually swept by the pointer, which only ever caught the
// cells directly under the drag path, not a filled rectangle. Only
// meaningful for the Select tool (BuildScreen only turns it on when
// toolMode is 'select' and nothing is floating) - Color/Erase Tool dragging
// and Duplicate/Move's floating-copy dragging both still go through
// onCellPress/onCellDrag exactly as before, since box select doesn't mean
// anything for those. Note a single click (no real drag) still toggles
// whatever cell you clicked regardless of color, same as always - the
// colored-only filter only applies to an actual box drag.
export default function PatternGridView({
  dualGrid, orientation, onCellPress, onCellDrag, onCellRelease, zoom, selectedCells, floatingCells,
  boxSelectEnabled, onBoxSelect,
}: {
  dualGrid:       DualGrid;
  orientation:    'horizontal' | 'vertical';
  onCellPress:    (pass: 'main' | 'gap', r: number, c: number) => void;
  onCellDrag:     (pass: 'main' | 'gap', r: number, c: number) => void;
  onCellRelease?: () => void;
  zoom:           number;
  selectedCells?:  Set<string> | null;
  floatingCells?:  FloatingCell[] | null;
  boxSelectEnabled?: boolean;
  onBoxSelect?:      (cells: LogicalCell[]) => void;
}) {
  const { theme } = useTheme();
  const BASE = 40;
  const D    = BASE * zoom;
  const H    = D / 2;

  const mainRows = dualGrid.main.length;
  const mainCols = mainRows > 0 ? dualGrid.main[0].length : 0;

  const displayMainRows = orientation === 'horizontal' ? mainRows : mainCols;
  const displayMainCols = orientation === 'horizontal' ? mainCols : mainRows;

  const svgWidth  = displayMainCols * D;
  const svgHeight = displayMainRows * D;

  const cells = buildCells(displayMainRows, displayMainCols, D);

  const containerRef = useRef<View>(null);
  const offsetRef    = useRef({ x: 0, y: 0 });
  const lastCellRef  = useRef<string | null>(null);

  // Only used while boxSelectEnabled - the cell the drag started on, and
  // the cell the pointer is currently over. Both start out equal to the
  // same cell; if they're still equal on release, nothing was actually
  // dragged, so it's treated as a plain click-toggle instead of a box.
  const [boxDrag, setBoxDrag] = useState<{ anchor: CellInfo; current: CellInfo } | null>(null);

  function resolveCell(cell: CellInfo): { r: number; c: number } {
    if (orientation === 'horizontal') {
      return { r: cell.gr, c: cell.gc };
    } else {
      if (cell.pass === 'main') {
        const maxDisplayCol = displayMainCols - 1;
        return { r: maxDisplayCol - cell.gc, c: cell.gr };
      } else {
        const maxGapDisplayCol = displayMainCols;
        return { r: maxGapDisplayCol - cell.gc, c: cell.gr };
      }
    }
  }

  function getCellColor(cell: CellInfo): string | null {
    const { r, c } = resolveCell(cell);
    const grid = cell.pass === 'main' ? dualGrid.main : dualGrid.gap;
    if (!grid[r] || grid[r][c] === undefined) return null;
    return grid[r][c];
  }

  // Reverse lookup (logical pass:r:c -> the display CellInfo that currently
  // sits there) - needed to draw the selection highlight and the floating
  // Duplicate/Move preview, both of which are handed logical coordinates by
  // BuildScreen. Cheap to rebuild each render given typical grid sizes,
  // same tradeoff the rest of this component already makes.
  const cellByLogical = new Map<string, CellInfo>();
  for (const cell of cells) {
    const { r, c } = resolveCell(cell);
    cellByLogical.set(cell.pass + ':' + r + ':' + c, cell);
  }

  function findCell(pageX: number, pageY: number): CellInfo | null {
    const rawX = pageX - offsetRef.current.x;
    const rawY = pageY - offsetRef.current.y;

    let best: CellInfo | null = null;
    let bestDist = Infinity;

    for (const cell of cells) {
      const dist = Math.abs(rawX - cell.cx) + Math.abs(rawY - cell.cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = cell;
      }
    }

    return (best && bestDist <= H) ? best : null;
  }

  // Shared by both the live marquee preview and the release-time hit-test,
  // so what you see while dragging is exactly what you get. Expanded by H
  // (half a diamond) past the anchor/current centers so the box visually
  // hugs the outer edge of whichever diamonds it swept over, rather than
  // stopping short at their centers.
  function boxBounds(a: CellInfo, b: CellInfo) {
    return {
      minX: Math.min(a.cx, b.cx) - H,
      maxX: Math.max(a.cx, b.cx) + H,
      minY: Math.min(a.cy, b.cy) - H,
      maxY: Math.max(a.cy, b.cy) + H,
    };
  }

  function handlePress(evt: any) {
    const pageX = evt.nativeEvent.pageX;
    const pageY = evt.nativeEvent.pageY;
    // Re-measure right now rather than trusting onLayout's cached position -
    // on web, that measurement doesn't reliably refire just because a
    // sibling above (the header) changed height and pushed this view down,
    // only when this view's own size changes. A stale offset here is
    // exactly what causes clicks to land on the wrong row.
    containerRef.current?.measureInWindow((x, y) => {
      offsetRef.current = { x, y };
      const cell = findCell(pageX, pageY);
      if (!cell) return;

      if (boxSelectEnabled) {
        // Deferred - don't decide click-vs-box yet, see handleRelease. This
        // avoids a toggle-then-immediately-re-add flicker for the common
        // case of starting a drag from an already-selected diamond.
        setBoxDrag({ anchor: cell, current: cell });
        return;
      }

      lastCellRef.current = cell.key;
      const { r, c } = resolveCell(cell);
      onCellPress(cell.pass, r, c);
    });
  }

  function handleMove(evt: any) {
    const cell = findCell(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    if (!cell) return;

    if (boxSelectEnabled) {
      if (!boxDrag) return; // press didn't land on a valid cell - nothing to grow
      if (cell.key === boxDrag.current.key) return;
      setBoxDrag(prev => (prev ? { ...prev, current: cell } : prev));
      return;
    }

    if (cell.key === lastCellRef.current) return;
    lastCellRef.current = cell.key;
    const { r, c } = resolveCell(cell);
    onCellDrag(cell.pass, r, c);
  }

  function handleRelease() {
    if (boxSelectEnabled && boxDrag) {
      if (boxDrag.anchor.key === boxDrag.current.key) {
        // No real movement - treat exactly like a plain click-toggle.
        const { r, c } = resolveCell(boxDrag.anchor);
        onCellPress(boxDrag.anchor.pass, r, c);
      } else {
        const { minX, maxX, minY, maxY } = boxBounds(boxDrag.anchor, boxDrag.current);
        const matches: LogicalCell[] = [];
        for (const cell of cells) {
          if (cell.cx < minX || cell.cx > maxX || cell.cy < minY || cell.cy > maxY) continue;
          if (!getCellColor(cell)) continue; // box-select only grabs colored diamonds - blanks aren't meaningful to select this way
          const { r, c } = resolveCell(cell);
          matches.push({ pass: cell.pass, r, c });
        }
        onBoxSelect?.(matches);
      }
      setBoxDrag(null);
    } else {
      lastCellRef.current = null;
    }
    onCellRelease?.();
  }

  const boxRect = boxDrag && boxDrag.anchor.key !== boxDrag.current.key
    ? boxBounds(boxDrag.anchor, boxDrag.current)
    : null;

  return (
    <View
      ref={containerRef}
      onLayout={() => {
        containerRef.current?.measureInWindow((x, y) => {
          offsetRef.current = { x, y };
        });
      }}
    >
      <Svg width={svgWidth} height={svgHeight}>
        {cells.map(cell => (
          <Polygon
            key={'bg-' + cell.key}
            points={cell.points}
            fill={theme.gridEmptyFill}
            stroke={theme.gridStroke}
            strokeWidth={0.75}
          />
        ))}
        {cells.map(cell => {
          const color = getCellColor(cell);
          if (!color) return null;
          return (
            <Polygon
              key={'fg-' + cell.key}
              points={cell.points}
              fill={color}
              stroke={theme.gridStroke}
              strokeWidth={0.75}
            />
          );
        })}
        <Rect
          x={0} y={0}
          width={svgWidth} height={svgHeight}
          rx={6}
          fill="none"
          stroke={theme.borderStrong}
          strokeWidth={1.25}
        />

        {/* Currently-selected diamonds (Select tool, before Duplicate/Move) -
            an arbitrary set of individual cells, same shape you'd paint. */}
        {selectedCells && selectedCells.size > 0 && cells.map(cell => {
          const { r, c } = resolveCell(cell);
          if (!selectedCells.has(cell.pass + ':' + r + ':' + c)) return null;
          return (
            <Polygon
              key={'sel-' + cell.key}
              points={cell.points}
              fill={theme.purpleOverlay}
              stroke={theme.purple}
              strokeWidth={2}
            />
          );
        })}

        {/* Floating Duplicate/Move copy - real colors underneath (so you can
            see what you're placing) plus a dashed purple tint on top marking
            it as not-yet-committed. Cells that have dragged off the edge of
            the grid simply have no matching display cell and are skipped. */}
        {floatingCells && floatingCells.map(fc => {
          const dispCell = cellByLogical.get(fc.pass + ':' + fc.r + ':' + fc.c);
          if (!dispCell) return null;
          return (
            <React.Fragment key={'float-' + fc.pass + '-' + fc.r + '-' + fc.c}>
              {fc.color && (
                <Polygon
                  points={dispCell.points}
                  fill={fc.color}
                  stroke={theme.gridStroke}
                  strokeWidth={0.75}
                />
              )}
              <Polygon
                points={dispCell.points}
                fill={theme.purpleOverlay}
                stroke={theme.purple}
                strokeWidth={2}
                strokeDasharray="6,4"
              />
            </React.Fragment>
          );
        })}

        {/* Live marquee preview while a box-select drag is in progress -
            same bounds boxBounds/handleRelease will actually hit-test
            against, so this is a faithful preview of what letting go right
            now would select. */}
        {boxRect && (
          <Rect
            x={boxRect.minX}
            y={boxRect.minY}
            width={boxRect.maxX - boxRect.minX}
            height={boxRect.maxY - boxRect.minY}
            fill={theme.purpleOverlay}
            stroke={theme.purple}
            strokeWidth={1.5}
            strokeDasharray="6,4"
          />
        )}
      </Svg>

      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handlePress}
        onResponderMove={handleMove}
        onResponderRelease={handleRelease}
      />
    </View>
  );
}
