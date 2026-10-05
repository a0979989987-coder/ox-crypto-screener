// Bound the whole operation, including response-body reads and module imports.
// A fetch timeout alone does not bound unrelated awaits or a stuck body reader.
export function withDeadline(operation, milliseconds, message = '載入逾時，請重試') {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException(message, 'TimeoutError');
      controller.abort(error); reject(error);
    }, milliseconds);
  });
  return Promise.race([Promise.resolve().then(() => operation(controller.signal)), timeout])
    .finally(() => clearTimeout(timer));
}
