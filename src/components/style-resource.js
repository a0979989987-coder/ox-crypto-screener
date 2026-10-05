import { withDeadline } from './resource-deadline.js';
export function createStyleLoader(fetcher = fetch, timeoutMs = 8000) {
  const resources = new Map();
  return function loadStyle(href) {
    const url = String(href);
    if (!resources.has(url)) {
      const task = withDeadline(async signal => {
        const response = await fetcher(url, { signal, cache: 'default' });
        if (!response.ok) throw Error(`樣式下載失敗（${response.status}）`);
        const css = await response.text();
        if (!css.trim() || /<(?:!doctype|html|body)\b/i.test(css)) throw Error('樣式檔案無效');
        // Inline styles resolve asset paths against the page, so preserve the
        // original stylesheet's base for any relative CSS asset URL.
        return css.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g, (match, quote, path) =>
          /^(?:data:|blob:|#)/i.test(path) ? match : `url("${new URL(path, url).href}")`);
      }, timeoutMs, '樣式載入逾時');
      resources.set(url, task);
      task.catch(() => { if (resources.get(url) === task) resources.delete(url); });
    }
    return resources.get(url);
  };
}
export const loadStyle = createStyleLoader();
