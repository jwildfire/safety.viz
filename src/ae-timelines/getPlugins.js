// Mark and tooltip construction for the ae-timelines module (#26): one
// floating-bar dataset per color-domain level (so the legend always carries
// the configured levels), a legend-only dataset for the serious-event
// highlight, a canvas plugin drawing the original's start-day dots and
// serious-event marks, and the original's term/start/stop tooltip text.

import { colorFor } from './structureData.js';

/**
 * Convert a #rrggbb hex color to an rgba() string with the given alpha —
 * the Chart.js equivalent of the original's 0.5 fill/stroke opacity.
 */
export function withAlpha(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Build the Chart.js datasets for a set of timeline events: one horizontal
 * floating-bar dataset per color-domain level — every level keeps a dataset
 * (and so a legend entry) even when empty — plus, when a highlight is
 * configured, an empty dataset carrying the serious-event legend item.
 */
export function buildDatasets(events, domain, settings) {
  const datasets = domain.map((level) => {
    const color = colorFor(level, domain, settings.color.colors);
    return {
      label: level,
      data: events
        .filter((event) => event.color === level)
        .map((event) => ({ x: [event.start, event.end], y: event.subject, __aet: event })),
      backgroundColor: withAlpha(color, 0.5),
      borderColor: color,
      borderWidth: 1,
      borderSkipped: false,
      barThickness: 8,
      grouped: false,
      xAxisID: 'x'
    };
  });
  if (settings.highlight) {
    datasets.push({
      label: settings.highlight.label,
      data: [],
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: settings.highlight.attributes.stroke,
      borderWidth: Number(settings.highlight.attributes['stroke-width']) || 2,
      grouped: false,
      xAxisID: 'x'
    });
  }
  return datasets;
}

/**
 * Tooltip lines for a timeline event, matching the original's mark tooltips:
 * reported term, start day, and stop day (raw values), plus the highlight
 * label and detail for serious events.
 */
export function tooltipLines(event, settings) {
  const lines = [
    `Reported Term: ${event.record[settings.term_col]}`,
    `Start Day: ${event.record[settings.stdy_col]}`,
    `Stop Day: ${event.record[settings.endy_col] ?? ''}`
  ];
  if (event.serious && settings.highlight) {
    const detailCol = settings.highlight.detail_col || settings.highlight.value_col;
    lines.push(`${settings.highlight.label}: ${event.record[detailCol]}`);
  }
  return lines;
}

/**
 * Canvas plugin drawing the original renderer's point marks over the bars:
 * a dot at every event's start day (never the stop day, AET-REG-005) and,
 * for serious events, an open highlight circle at the start plus an outline
 * across the event duration (AET-REG-006). The drawn marks are exposed on
 * chart.$aetMarks for the browser evidence.
 */
export function timelineMarksPlugin(settings) {
  const highlight = settings.highlight;
  const stroke = highlight ? highlight.attributes.stroke : 'black';
  const strokeWidth = highlight ? Number(highlight.attributes['stroke-width']) || 2 : 2;
  return {
    id: 'aetTimelineMarks',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const marks = [];
      chart.data.datasets.forEach((dataset, datasetIndex) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;
        dataset.data.forEach((point, index) => {
          const event = point.__aet;
          const element = meta.data[index];
          if (!event || !element) return;
          const x0 = chart.scales.x.getPixelForValue(event.start);
          const x1 = chart.scales.x.getPixelForValue(event.end);
          const y = element.y;
          ctx.save();
          ctx.beginPath();
          ctx.arc(x0, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = dataset.backgroundColor;
          ctx.strokeStyle = dataset.borderColor;
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
          if (event.serious) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = strokeWidth;
            ctx.beginPath();
            ctx.arc(x0, y, 6, 0, Math.PI * 2);
            ctx.stroke();
            if (x1 > x0) {
              ctx.beginPath();
              ctx.moveTo(x0, y);
              ctx.lineTo(x1, y);
              ctx.stroke();
            }
          }
          ctx.restore();
          marks.push({
            subject: event.subject,
            start: event.start,
            end: event.end,
            serious: event.serious,
            x0,
            x1,
            y,
            circleX: x0
          });
        });
      });
      chart.$aetMarks = marks;
    }
  };
}
