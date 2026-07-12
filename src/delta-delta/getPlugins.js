// Chart.js plugins and the derived statistics for the delta-delta scatter
// (#25): the quadrant reference lines, the optional linear regression line
// (SDD-REG-026), the participant-count annotation (SDD-FUNC-004), and the
// point-selection styling (SDD-REG-012). The regression math is a pure
// function so it can be unit-tested against a hand-computed fixture.

import { formatNumber } from './getScales.js';

// Ordinary least-squares fit of y on x over [x, y] pairs. Returns the slope,
// intercept, R², a predict() helper, and a rendered equation string; null when
// fewer than two points or x has no spread (an undefined slope).
export function linearRegression(pairs) {
  const points = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((sum, [x]) => sum + x, 0);
  const sumY = points.reduce((sum, [, y]) => sum + y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  const sign = intercept >= 0 ? '+' : '-';
  return {
    slope,
    intercept,
    r2,
    predict: (x) => slope * x + intercept,
    string: `y = ${formatNumber(slope)}x ${sign} ${formatNumber(Math.abs(intercept))}`
  };
}

// Percentage of participants currently shown, to one decimal place
// (SDD-FUNC-004).
export function participantCountText(shown, total) {
  const pct = total ? ((shown / total) * 100).toFixed(1) : '0.0';
  const unit = total === 1 ? 'participant' : 'participants';
  return `${shown} of ${total} ${unit} shown (${pct}%).`;
}

// Reference lines through the origin that split the scatter into the four
// change quadrants (increase/decrease in each measure).
export function quadrantLinesPlugin() {
  return {
    id: 'delta-delta-quadrants',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!scales.x || !scales.y) return;
      const x0 = scales.x.getPixelForValue(0);
      const y0 = scales.y.getPixelForValue(0);
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      if (x0 >= chartArea.left && x0 <= chartArea.right) {
        ctx.beginPath();
        ctx.moveTo(x0, chartArea.top);
        ctx.lineTo(x0, chartArea.bottom);
        ctx.stroke();
      }
      if (y0 >= chartArea.top && y0 <= chartArea.bottom) {
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y0);
        ctx.lineTo(chartArea.right, y0);
        ctx.stroke();
      }
      ctx.restore();
    }
  };
}

// Dashed simple-linear-regression line spanning the x-domain, drawn when the
// instance has regression enabled and a resolvable fit (SDD-REG-026). The fit
// is computed in the instance's render() and stored on `instance.regression`.
export function regressionLinePlugin(instance) {
  return {
    id: `delta-delta-regression-${Math.random().toString(36).slice(2)}`,
    afterDatasetsDraw(chart) {
      if (!instance.state.addRegressionLine || !instance.regression) return;
      const { ctx, chartArea, scales } = chart;
      const [xMin, xMax] = [scales.x.min, scales.x.max];
      const left = {
        x: scales.x.getPixelForValue(xMin),
        y: scales.y.getPixelForValue(instance.regression.predict(xMin))
      };
      const right = {
        x: scales.x.getPixelForValue(xMax),
        y: scales.y.getPixelForValue(instance.regression.predict(xMax))
      };
      ctx.save();
      ctx.beginPath();
      ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height);
      ctx.clip();
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
      ctx.restore();
    }
  };
}

// Per-point border styling that thickens and blackens the selected point
// (SDD-REG-012); unselected points keep a thin translucent border.
export function selectionBorders(count, selectedIndex) {
  return {
    colors: Array.from({ length: count }, (_, index) =>
      index === selectedIndex ? '#111827' : 'rgba(37, 99, 235, 0.9)'
    ),
    widths: Array.from({ length: count }, (_, index) => (index === selectedIndex ? 3 : 0.5))
  };
}
