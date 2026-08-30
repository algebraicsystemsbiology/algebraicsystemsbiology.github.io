// How It Connects — chord diagram, merged natively into the Our Research page.
// Wrapped in an IIFE so its variables and helper functions don't leak onto
// window or collide with anything else running on the page.
(function () {

  // The themes, their colours and their url slugs all come from
  // data/research-themes.json. This file used to carry its own copy, which had
  // gone wrong quietly: its last entry was "Other Applications", a name no
  // publication is tagged with, while the 26 publications tagged "From Coral
  // to Contagions" matched nothing and were left out of the diagram entirely.
  let THEMES = [];
  let THEME_COLOURS = {};
  let THEME_SLUGS = {};

  const THEMES_URL = '/data/research-themes.json';

  async function loadThemes() {
    const res = await fetch(THEMES_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load research-themes.json: ${res.status}`);
    const themes = await res.json();
    THEMES = themes.map(t => t.name);
    THEME_COLOURS = Object.fromEntries(themes.map(t => [t.name, t.colour]));
    THEME_SLUGS = Object.fromEntries(themes.map(t => [t.name, t.slug]));
  }

  // ── Data loading ─────────────────────────────────────────────────────
  // The only place this script touches data. The co-occurrence matrix below
  // is computed live from data/publications.json every time the page loads,
  // so adding, removing, or re-tagging a publication updates this diagram
  // automatically — no code changes required.

  const DATA_URL = '/data/publications.json';

  async function loadConnections() {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
    const raw = await res.json();
    const pubs = Object.values(raw);

    const themeIndex = {};
    THEMES.forEach((t, i) => { themeIndex[t] = i; });
    const n = THEMES.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    const soloCounts = Array(n).fill(0);

    pubs.forEach(p => {
      const kws = [...new Set((p.keywords || []).filter(k => k in themeIndex))];
      kws.forEach(k => { soloCounts[themeIndex[k]] += 1; });
      for (let a = 0; a < kws.length; a++) {
        for (let b = a + 1; b < kws.length; b++) {
          const i = themeIndex[kws[a]], j = themeIndex[kws[b]];
          matrix[i][j] += 1;
          matrix[j][i] += 1;
        }
      }
    });

    return { themes: THEMES, matrix, publication_counts: soloCounts };
  }

  function showMessage(root, text) {
    const el = root.querySelector('.connects-state-message');
    const svgEl = root.querySelector('.connects-chart svg');
    el.textContent = text;
    el.hidden = false;
    svgEl.style.display = 'none';
  }

  // ── Geometry helpers ─────────────────────────────────────────────────

  function polar(cx, cy, r, angle) {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function arcPath(cx, cy, r0, r1, a0, a1) {
    const large = ((a1 - a0) % (Math.PI * 2)) > Math.PI ? 1 : 0;
    const [x0, y0] = polar(cx, cy, r1, a0);
    const [x1, y1] = polar(cx, cy, r1, a1);
    const [x2, y2] = polar(cx, cy, r0, a1);
    const [x3, y3] = polar(cx, cy, r0, a0);
    return [
      `M ${x0} ${y0}`,
      `A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1}`,
      `L ${x2} ${y2}`,
      `A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3}`,
      'Z'
    ].join(' ');
  }

  function ribbonPath(cx, cy, r, a0, a1, b0, b1) {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    const [x2, y2] = polar(cx, cy, r, b0);
    const [x3, y3] = polar(cx, cy, r, b1);
    const large1 = (a1 - a0) > Math.PI ? 1 : 0;
    const large2 = (b1 - b0) > Math.PI ? 1 : 0;
    return [
      `M ${x0} ${y0}`,
      `A ${r} ${r} 0 ${large1} 1 ${x1} ${y1}`,
      `Q ${cx} ${cy} ${x2} ${y2}`,
      `A ${r} ${r} 0 ${large2} 1 ${x3} ${y3}`,
      `Q ${cx} ${cy} ${x0} ${y0}`,
      'Z'
    ].join(' ');
  }

  function buildLayout(data) {
    const { themes, matrix, publication_counts } = data;
    const n = themes.length;
    const PAD_ANGLE = 0.012;

    const rowSums = matrix.map(row => row.reduce((a, b) => a + b, 0));
    const baseline = publication_counts.map((c, i) => Math.max(c - rowSums[i], 0));
    const groupTotals = rowSums.map((s, i) => s + baseline[i]);
    const grandTotal = groupTotals.reduce((a, b) => a + b, 0) || 1;

    const totalPad = PAD_ANGLE * n;
    const usable = Math.PI * 2 - totalPad;

    let cursor = -Math.PI / 2;
    const groups = themes.map((theme, i) => {
      const span = (groupTotals[i] / grandTotal) * usable;
      const start = cursor;
      const end = cursor + span;
      cursor = end + PAD_ANGLE;
      return { theme, index: i, start, end, total: groupTotals[i] };
    });

    const chords = [];
    const groupCursors = groups.map(g => g.start);

    for (let i = 0; i < n; i++) {
      const group = groups[i];
      const span = group.end - group.start;
      const scale = group.total > 0 ? span / group.total : 0;

      if (baseline[i] > 0) groupCursors[i] += baseline[i] * scale;

      for (let j = 0; j < n; j++) {
        if (j <= i) continue;
        const weight = matrix[i][j];
        if (!weight) continue;

        const wi = weight * scale;
        const a0 = groupCursors[i];
        const a1 = groupCursors[i] + wi;
        groupCursors[i] = a1;

        const groupJ = groups[j];
        const scaleJ = groupJ.total > 0 ? (groupJ.end - groupJ.start) / groupJ.total : 0;
        const wj = weight * scaleJ;
        const b0 = groupCursors[j];
        const b1 = groupCursors[j] + wj;
        groupCursors[j] = b1;

        chords.push({ source: i, target: j, weight, a0, a1, b0, b1 });
      }
    }

    return { groups, chords, baseline };
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Splits a theme label into at most two lines, breaking near the midpoint
  // on a word boundary so long names like "Identifiability, Statistics, & AI"
  // don't run off the edge of the chart.
  function wrapLabel(text, maxCharsPerLine = 22) {
    if (text.length <= maxCharsPerLine) return [text];

    const words = text.split(' ');
    let line1 = '';
    let line2 = '';
    for (const word of words) {
      if ((line1 + ' ' + word).trim().length <= maxCharsPerLine || !line1) {
        line1 = (line1 + ' ' + word).trim();
      } else {
        line2 = (line2 + ' ' + word).trim();
      }
    }
    return line2 ? [line1, line2] : [line1];
  }

  function render(root, data) {
    const themesUsed = data.themes.filter((t, i) =>
      data.publication_counts[i] > 0 || data.matrix[i].some(v => v > 0)
    );

    if (!themesUsed.length) {
      showMessage(root, 'No publications tagged with themes yet.');
      return;
    }

    const SIZE = 720, CENTER = SIZE / 2, OUTER_R = 300, INNER_R = 284, LABEL_R = OUTER_R + 22;
    const layout = buildLayout(data);
    const cx = CENTER, cy = CENTER;

    const svg = d3.select(root.querySelector('.connects-chart svg')).attr('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.selectAll('*').remove();

    const ribbonsG = svg.append('g').attr('class', 'chord-ribbons');
    const arcsG = svg.append('g').attr('class', 'chord-arcs');
    const labelsG = svg.append('g').attr('class', 'chord-labels');

    const ribbons = ribbonsG.selectAll('path')
      .data(layout.chords)
      .join('path')
      .attr('class', 'chord-ribbon')
      .attr('d', c => ribbonPath(cx, cy, INNER_R - 1, c.a0, c.a1, c.b0, c.b1))
      .attr('fill', c => THEME_COLOURS[layout.groups[c.source].theme] || '#aaa')
      .attr('fill-opacity', 0.55)
      .attr('stroke', c => THEME_COLOURS[layout.groups[c.source].theme] || '#aaa')
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', 0.5);

    const arcs = arcsG.selectAll('path')
      .data(layout.groups)
      .join('path')
      .attr('class', 'chord-arc')
      .attr('d', g => arcPath(cx, cy, INNER_R, OUTER_R, g.start, g.end))
      .attr('fill', g => THEME_COLOURS[g.theme] || '#aaa');

    const labels = labelsG.selectAll('text')
      .data(layout.groups)
      .join('text')
      .attr('class', 'chord-label')
      .each(function (g) {
        const mid = (g.start + g.end) / 2;
        const [lx, ly] = polar(cx, cy, LABEL_R, mid);
        const deg = mid * 180 / Math.PI;
        const flip = deg > 90 && deg < 270;

        const sel = d3.select(this)
          .attr('x', lx).attr('y', ly)
          .attr('text-anchor', flip ? 'end' : 'start')
          .attr('transform', `rotate(${flip ? deg + 180 : deg} ${lx} ${ly})`);

        const lines = wrapLabel(g.theme);
        const lineHeight = 16; // px, roughly matches font-size
        const startDy = -((lines.length - 1) * lineHeight) / 2;

        sel.selectAll('tspan')
          .data(lines)
          .join('tspan')
          .attr('x', lx)
          .attr('dy', (d, i) => i === 0 ? startDy : lineHeight)
          .text(d => d);
      });

    // Interaction
    const tooltip = d3.select(root.querySelector('.connects-tooltip'));

    function tip(event, html) {
      tooltip.html(html).style('opacity', 1)
        .style('left', (event.clientX + 14) + 'px')
        .style('top', (event.clientY - 10) + 'px');
    }
    function moveTip(event) {
      tooltip.style('left', (event.clientX + 14) + 'px').style('top', (event.clientY - 10) + 'px');
    }
    function hideTip() { tooltip.style('opacity', 0); }

    function setHighlight(themeIndex) {
      ribbons.style('opacity', c => themeIndex === null || c.source === themeIndex || c.target === themeIndex ? 1 : 0.08);
      arcs.style('opacity', g => themeIndex === null || g.index === themeIndex ? 1 : 0.35);
      labels.classed('is-active', g => g.index === themeIndex);
    }

    arcs
      .on('mouseenter', (ev, g) => {
        setHighlight(g.index);
        tip(ev, `<strong>${escapeHtml(g.theme)}</strong><span class="sub">${g.total} publication${g.total === 1 ? '' : 's'}</span>`);
      })
      .on('mousemove', moveTip)
      .on('mouseleave', () => { setHighlight(null); hideTip(); })
      .on('click', (ev, g) => {
        // The slug is written in research-themes.json rather than derived
        // from the name, so this link cannot drift from the one the
        // research page's tiles use.
        const slug = THEME_SLUGS[g.theme] || '';
        window.location.href = `/publications/?theme=${encodeURIComponent(slug)}&label=${encodeURIComponent(g.theme)}`;
      });

    ribbons
      .on('mouseenter', function (ev, c) {
        setHighlight(null);
        d3.select(this).style('opacity', 1).style('stroke-width', 1.2);
        const a = layout.groups[c.source].theme, b = layout.groups[c.target].theme;
        tip(ev, `<strong>${escapeHtml(a)} &harr; ${escapeHtml(b)}</strong><span class="sub">${c.weight} shared publication${c.weight === 1 ? '' : 's'}</span>`);
      })
      .on('mousemove', moveTip)
      .on('mouseleave', function () {
        d3.select(this).style('stroke-width', 0.5);
        setHighlight(null);
        hideTip();
      });

    svg.on('mouseleave', () => { setHighlight(null); hideTip(); });
  }

  function init() {
    const root = document.querySelector('.connects-block');
    if (!root) return;

    loadThemes()
      .then(loadConnections)
      .then(data => render(root, data))
      .catch(err => {
        console.error(err);
        showMessage(root, 'Sorry — the diagram could not be loaded.');
      });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
