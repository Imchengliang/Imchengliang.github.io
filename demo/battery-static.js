/* Fixed snapshot queries with the shared Python statistics in a worker. */
'use strict';
const BatteryStatic = (() => {
  function create(data) {
    let worker, sequence = 0;
    const pending = new Map();
    function fail(error) {
      worker?.terminate();worker = null;
      for (const job of pending.values()) { clearTimeout(job.timer);job.reject(error); }
      pending.clear();
    }
    function statistics(rows, filters, progress) {
      if (!worker) {
        worker = new Worker(new URL('battery-statistics-worker.mjs', document.baseURI), {type: 'module'});
        worker.onmessage = ({data: message}) => {
          const job = pending.get(message.id);
          if (!job) return;
          if (message.progress) { job.progress?.(message.progress);return; }
          if (message.error) { fail(Error(message.error));return; }
          clearTimeout(job.timer);pending.delete(message.id);job.resolve(message.statistics);
        };
        worker.onerror = () => fail(Error('Python statistics could not load. Check your connection and retry.'));
      }
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => fail(Error('Python statistics took too long to load. Check your connection and retry.')), 180000);
        pending.set(id, {resolve, reject, progress, timer});
        worker.postMessage({id, rows, filters, profiles: data.profiles, methods: data.methods});
      });
    }
    return async (filters, progress) => {
      const rows = BatteryOverview.query(data, filters);
      return {rows, statistics: filters.statistics && rows.length ? await statistics(rows, filters, progress) : [], backend: 'Browser Python'};
    };
  }
  return {create};
})();
