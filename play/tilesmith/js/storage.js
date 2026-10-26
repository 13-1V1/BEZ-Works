// Created by: Brennan Meyer with use of Codex 09/17/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com
(function () {
  'use strict';
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('tilesmith-local', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other TileSmith tabs to enable recovery.'));
    });
    return database;
  }
  async function transact(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const request = action(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error || new Error('Recovery storage is unavailable.'));
      tx.onabort = () => reject(tx.error || new Error('Recovery save was interrupted.'));
    });
  }
  window.TileStorage = {
    read: () => transact('readonly', store => store.get('latest')),
    write: project => transact('readwrite', store => store.put({ project, savedAt: Date.now() }, 'latest'))
  };
})();
