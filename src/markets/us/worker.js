import { tierResults, matchPath } from "./analysis.js?v=20261002-rank6";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      rows:
        data.points?.length > 1
          ? matchPath(data.rows, data.points, data.options)
          : tierResults(data.rows, data.options),
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
