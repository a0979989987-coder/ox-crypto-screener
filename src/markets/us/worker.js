import { tierResults, matchPath } from "./analysis.js?v=20261001-loading1";
self.onmessage = ({ data }) => {
  try {
    const onProgress=(done,total)=>{if(done===0||done===total||done%25===0)self.postMessage({id:data.id,progress:{done,total}});};
    self.postMessage({
      id: data.id,
      rows:
        data.points?.length > 1
          ? matchPath(data.rows, data.points, onProgress)
          : tierResults(data.rows, {...data.options,onProgress}),
    });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
