// These records stay in this browser origin. No upload or sync endpoint exists.
export function deviceRecord(key, value) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return value === undefined ? resolve(null) : reject(Error('此瀏覽器無法保存本機資料。'));
    const request = indexedDB.open('ox-us-device', 1);
    let settled = false, transaction;
    const fail = error => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      try { transaction?.abort(); } catch { /* Already committed or aborted. */ }
      reject(error || Error('本機儲存無法使用。'));
    };
    const timer = setTimeout(() => fail(Error('本機儲存逾時，請重試。')), 10000);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(Error('本機儲存被其他分頁阻擋，請關閉舊分頁後重試。'));
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      transaction = db.transaction('records', value === undefined ? 'readonly' : 'readwrite');
      const store = transaction.objectStore('records');
      const operation = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key);
      let result;
      operation.onsuccess = () => { result = operation.result; };
      transaction.oncomplete = () => {
        db.close(); if (settled) return;
        settled = true; clearTimeout(timer); resolve(value === undefined ? result ?? null : true);
      };
      transaction.onerror = () => { db.close(); fail(transaction.error); };
      transaction.onabort = () => { db.close(); fail(transaction.error); };
    };
  });
}
