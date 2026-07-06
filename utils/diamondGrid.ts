export type CellInfo = {
  key:    string;
  cx:     number;
  cy:     number;
  pass:   'main' | 'gap';
  gr:     number;
  gc:     number;
  points: string;
};

export function buildCells(mainRows: number, mainCols: number, D: number): CellInfo[] {
  const H = D / 2;
  const cells: CellInfo[] = [];

  function pts(cx: number, cy: number): string {
    return (
      cx + ',' + (cy - H) + ' ' +
      (cx + H) + ',' + cy + ' ' +
      cx + ',' + (cy + H) + ' ' +
      (cx - H) + ',' + cy
    );
  }

  for (let dr = 0; dr < mainRows; dr++) {
    for (let dc = 0; dc < mainCols; dc++) {
      const cx = dc * D + H;
      const cy = dr * D + H;
      cells.push({ key: 'main-' + dr + '-' + dc, cx, cy, pass: 'main', gr: dr, gc: dc, points: pts(cx, cy) });
    }
  }

  const gapRows = mainRows + 1;
  const gapCols = mainCols + 1;
  for (let dr = 0; dr < gapRows; dr++) {
    for (let dc = 0; dc < gapCols; dc++) {
      const cx = dc * D;
      const cy = dr * D;
      cells.push({ key: 'gap-' + dr + '-' + dc, cx, cy, pass: 'gap', gr: dr, gc: dc, points: pts(cx, cy) });
    }
  }

  return cells;
}
