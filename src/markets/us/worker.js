import { tierResults, matchPath } from "./analysis.js?v=20261001-tiercomb1";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      id: data.id,
      rows:
        data.points?.length > 1
          ? matchPath(data.rows, data.points)
          : tierResults(data.rows, data.options),
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
