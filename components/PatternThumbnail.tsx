import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { DualGrid } from '../types/pattern';
import { CellInfo, buildCells } from '../utils/diamondGrid';

const EMPTY_FILL = '#f0efeb';
const STROKE     = '#525252';

// Same two-pass rendering BuildScreen uses (background diamonds, then
// colored ones on top) at a fixed small internal scale - the viewBox lets
// it shrink to fit any card size without recomputing the geometry.
const CELL_SIZE = 40;

export default function PatternThumbnail({
  dualGrid,
  diamondSize = 15,
  maxCols,
  fitWidth,
}: {
  dualGrid: DualGrid;
  // Every diamond renders at exactly this pixel size, regardless of the
  // pattern's dimensions - callers pick the size that fits their layout
  // (e.g. a small fixed size for a card grid) rather than this component
  // ever stretching to fit a box. Ignored if fitWidth is provided.
  diamondSize?: number;
  // If the pattern is longer than this, only the first maxCols columns
  // are rendered - lets every card in a grid stay an identical width
  // regardless of how long the underlying bracelet actually is. Ignored
  // if fitWidth is set, since the whole point there is showing the
  // complete pattern.
  maxCols?: number;
  // Instead of a fixed diamond size, show the ENTIRE pattern (no
  // cropping) scaled so it's exactly this many pixels wide - used for a
  // full-pattern preview that must never need horizontal scrolling,
  // regardless of how long the bracelet actually is.
  fitWidth?: number;
}) {
  const fullMainRows = dualGrid.main.length;
  const fullMainCols = fullMainRows > 0 ? dualGrid.main[0].length : 0;
  if (fullMainRows === 0 || fullMainCols === 0) return null;

  const effectiveDiamondSize = fitWidth != null ? fitWidth / fullMainCols : diamondSize;

  const isCropped = fitWidth == null && maxCols != null && fullMainCols > maxCols;
  const mainCols  = isCropped ? maxCols! : fullMainCols;
  const mainRows  = fullMainRows;

  // The gap grid has one more column than the main grid (it includes both
  // edges), so its crop boundary needs the +1 to line up correctly.
  const mainGrid = isCropped ? dualGrid.main.map(row => row.slice(0, mainCols)) : dualGrid.main;
  const gapGrid  = isCropped ? dualGrid.gap.map(row => row.slice(0, mainCols + 1)) : dualGrid.gap;

  const svgWidth  = mainCols * CELL_SIZE;
  const svgHeight = mainRows * CELL_SIZE;
  const renderedWidth  = mainCols * effectiveDiamondSize;
  const renderedHeight = mainRows * effectiveDiamondSize;

  const cells = buildCells(mainRows, mainCols, CELL_SIZE);

  function getCellColor(cell: CellInfo): string | null {
    const grid = cell.pass === 'main' ? mainGrid : gapGrid;
    if (!grid[cell.gr] || grid[cell.gr][cell.gc] === undefined) return null;
    return grid[cell.gr][cell.gc];
  }

  return (
    <View style={{ width: renderedWidth, height: renderedHeight }}>
      <Svg
        width={renderedWidth}
        height={renderedHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {cells.map(cell => (
          <Polygon
            key={'bg-' + cell.key}
            points={cell.points}
            fill={EMPTY_FILL}
            stroke={STROKE}
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
              stroke={STROKE}
              strokeWidth={0.75}
            />
          );
        })}
      </Svg>
    </View>
  );
}
