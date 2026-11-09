/* Python stays in a worker so loading and calculations leave the UI responsive. */
import {loadPyodide} from 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs';
let runtime, queue = Promise.resolve();
async function initialize() {
  const python = await loadPyodide();
  const response = await fetch(new URL('battery_statistics.py?v=light-statistics-20261109', import.meta.url));
  if (!response.ok) throw Error('Statistics code unavailable');
  await python.runPythonAsync(await response.text());
  return python;
}
self.onmessage = ({data: message}) => {
  queue = queue.then(async () => {
    try {
      if (!runtime) {
        self.postMessage({id: message.id, progress: 'Loading Python statistics for the first use…'});
        runtime = initialize();
      }
      const python = await runtime;
      self.postMessage({id: message.id, progress: 'Calculating summary…'});
      python.globals.set('_request_json', JSON.stringify(message));
      const result = await python.runPythonAsync(`
import json
_request = json.loads(_request_json)
json.dumps(summarize(_request['rows'],
    {row['id']: row for row in _request['profiles']},
    {row['id']: row for row in _request['methods']},
    _request['filters']), allow_nan=False)
`);
      self.postMessage({id: message.id, statistics: JSON.parse(result)});
    } catch (error) {
      console.error(error);
      self.postMessage({id: message.id, error: 'Python statistics could not load or run. Check your connection and retry.'});
    }
  });
};
