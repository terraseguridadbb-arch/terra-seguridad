/* Preview-only diagnostic branch. Never merge into production. No data leaves this page. */
(() => {
  const values = { base: 'ac7111f', started: new Date().toISOString(), lcp_ms: null, cls: 0, shifts: [], interactions: 0, max_interaction_ms: null, long_task_blocking_ms: 0 };
  let first = 0, last = 0, session = 0;
  const interactionDurations = new Map();
  const observe = (type, callback, extra = {}) => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
    new PerformanceObserver(list => list.getEntries().forEach(callback)).observe({ type, buffered: true, ...extra });
  };
  observe('largest-contentful-paint', e => { values.lcp_ms = e.startTime; values.lcp_element = e.element?.tagName || null; });
  observe('layout-shift', e => {
    if (e.hadRecentInput) return;
    if (!first || e.startTime - last > 1000 || e.startTime - first > 5000) { first = e.startTime; session = 0; }
    last = e.startTime; session += e.value; values.cls = Math.max(values.cls, session);
    if (values.shifts.length < 30) values.shifts.push({ time: e.startTime, value: e.value, elements: (e.sources || []).map(s => s.node?.tagName || 'unknown') });
  });
  observe('event', e => {
    if (!e.interactionId) return;
    interactionDurations.set(e.interactionId, Math.max(interactionDurations.get(e.interactionId) || 0, e.duration));
    values.interactions = interactionDurations.size;
    values.max_interaction_ms = Math.max(...interactionDurations.values());
  }, { durationThreshold: 16 });
  observe('longtask', e => { values.long_task_blocking_ms += Math.max(0, e.duration - 50); });
  addEventListener('load', () => {
    setTimeout(() => {
      const button = document.createElement('button');
      button.textContent = 'Ver medición QA';
      button.id = 'qa-performance-button';
      button.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:white;color:black;padding:8px;border:2px solid #005bb5;font:14px sans-serif';
      button.addEventListener('click', () => {
        const nav = performance.getEntriesByType('navigation')[0];
        const output = document.createElement('pre');
        output.id = 'qa-performance-result';
        output.style.cssText = 'position:fixed;inset:8%;overflow:auto;background:white;color:black;z-index:100000;padding:20px;border:2px solid #005bb5;font:13px monospace;white-space:pre-wrap';
        output.textContent = JSON.stringify({ ...values, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, ttfb_ms: nav?.responseStart, dom_content_loaded_ms: nav?.domContentLoadedEventEnd, page_complete_ms: nav?.loadEventEnd, elapsed_ms: performance.now(), note: 'Medición diagnóstica Chrome de escritorio sin throttling. No es Lighthouse, CrUX ni un teléfono físico. max_interaction_ms no equivale a INP de campo. Clic en el informe para cerrar.' }, null, 2);
        output.addEventListener('click', () => output.remove());
        document.body.append(output);
      });
      document.body.append(button);
    }, 6000);
  });
})();
