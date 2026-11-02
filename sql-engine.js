/**
 * sql-engine.js
 * Engine SQL chạy client-side bằng sql.js (SQLite WASM) từ CDN.
 * Dùng chung cho Outline / Practice / Test.
 */
(function (global) {
  'use strict';

  const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
  let loadPromise = null;

  function ensureLoaded() {
    if (global.SQL) return Promise.resolve(global.SQL);
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      function init() {
        global.initSqlJs({ locateFile: function (file) { return CDN + file; } })
          .then(function (SQL) { global.SQL = SQL; resolve(SQL); })
          .catch(function (e) { loadPromise = null; reject(e); });
      }
      if (global.initSqlJs) {
        init();
        return;
      }
      const script = document.createElement('script');
      script.src = CDN + 'sql-wasm.js';
      script.onload = init;
      script.onerror = function () { loadPromise = null; reject(new Error('Không tải được sql.js từ CDN.')); };
      document.head.appendChild(script);
    });
    return loadPromise;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function base64ToUint8(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function getSetupSql(itemOrSql) {
    if (typeof itemOrSql === 'string') return itemOrSql;
    if (!itemOrSql) return '';
    return itemOrSql.setupSql || itemOrSql.initSql || itemOrSql.schema || itemOrSql.initialSql || '';
  }

  async function createDb(itemOrSql) {
    const SQL = await ensureLoaded();
    const setupSql = getSetupSql(itemOrSql);
    const initialData = (typeof itemOrSql === 'object' && itemOrSql) ? itemOrSql.initialData : null;

    let db = null;
    if (initialData && !setupSql) {
      try {
        let bytes = null;
        if (typeof initialData === 'string') bytes = base64ToUint8(initialData);
        else bytes = new Uint8Array(initialData);
        db = new SQL.Database(bytes);
      } catch (e) {
        db = null;
      }
    }
    if (!db) db = new SQL.Database();
    if (setupSql && String(setupSql).trim()) {
      db.exec(String(setupSql));
    }
    return db;
  }

  function splitStatements(sql) {
    return String(sql || '')
      .split(';')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function firstKeyword(stmt) {
    // bỏ comment dòng -- ...
    const cleaned = stmt.replace(/--[^\n]*/g, '').trim();
    const m = cleaned.match(/^([A-Za-z]+)/);
    return m ? m[1].toUpperCase() : '';
  }

  function isSelectOnly(sql) {
    const stmts = splitStatements(sql);
    if (stmts.length === 0) return true;
    for (let i = 0; i < stmts.length; i++) {
      const kw = firstKeyword(stmts[i]);
      if (kw !== 'SELECT' && kw !== 'WITH') return false;
    }
    return true;
  }

  function run(db, sql) {
    const results = db.exec(sql);
    if (!results || results.length === 0) {
      return { columns: [], values: [] };
    }
    const last = results[results.length - 1];
    return {
      columns: last.columns || [],
      values: last.values || [],
    };
  }

  function normalizeValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string') {
      const t = v.trim();
      if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
      return v;
    }
    return v;
  }

  function compareResults(a, b, ordered) {
    if (!a || !b) return false;
    const ca = a.columns || [];
    const cb = b.columns || [];
    if (ca.length !== cb.length) return false;

    let va = (a.values || []).map(function (row) { return row.map(normalizeValue); });
    let vb = (b.values || []).map(function (row) { return row.map(normalizeValue); });
    if (va.length !== vb.length) return false;

    if (ordered === false) {
      va = va.slice().sort(function (x, y) { return JSON.stringify(x) < JSON.stringify(y) ? -1 : (JSON.stringify(x) > JSON.stringify(y) ? 1 : 0); });
      vb = vb.slice().sort(function (x, y) { return JSON.stringify(x) < JSON.stringify(y) ? -1 : (JSON.stringify(x) > JSON.stringify(y) ? 1 : 0); });
    }

    for (let i = 0; i < va.length; i++) {
      if (JSON.stringify(va[i]) !== JSON.stringify(vb[i])) return false;
    }
    return true;
  }

  async function grade(item, userSql) {
    const sql = String(userSql == null ? '' : userSql).trim();
    if (!sql) {
      return { correct: false, error: 'Chưa nhập lệnh SQL.', userResult: null, answerResult: null };
    }
    if (!isSelectOnly(sql)) {
      return { correct: false, error: 'Chỉ chấp nhận lệnh SELECT (không dùng INSERT/UPDATE/DELETE/CREATE/DROP).', userResult: null, answerResult: null };
    }

    const setupSql = getSetupSql(item);
    const answerSql = (item && (item.answer || item.answerSql || item.expectedSql)) || '';
    const ordered = (item && typeof item.ordered === 'boolean') ? item.ordered : true;

    let dbU = null, dbA = null;
    let userResult = null, answerResult = null, error = null;

    try {
      dbU = await createDb(setupSql);
      userResult = run(dbU, sql);
    } catch (e) {
      error = (e && e.message) ? e.message : String(e);
    }
    try {
      dbA = await createDb(setupSql);
      answerResult = run(dbA, answerSql);
    } catch (e) {
      if (!error) error = (e && e.message) ? e.message : String(e);
    } finally {
      try { if (dbU) dbU.close(); } catch (e) {}
      try { if (dbA) dbA.close(); } catch (e) {}
    }

    if (error) {
      return { correct: false, error: error, userResult: userResult, answerResult: answerResult };
    }
    const correct = compareResults(userResult, answerResult, ordered);
    return { correct: correct, error: null, userResult: userResult, answerResult: answerResult };
  }

  async function preview(item, userSql, container) {
    const sql = String(userSql == null ? '' : userSql).trim();
    const setupSql = getSetupSql(item);
    container.innerHTML = '';
    if (!sql) {
      const p = document.createElement('p');
      p.className = 'sql-empty';
      p.textContent = 'Chưa có lệnh SQL.';
      container.appendChild(p);
      return;
    }
    let db = null;
    try {
      db = await createDb(setupSql);
      const res = run(db, sql);
      renderTable(container, res, 'Kết quả:');
    } catch (e) {
      renderTable(container, { error: (e && e.message) ? e.message : String(e) }, 'Lỗi:');
    } finally {
      try { if (db) db.close(); } catch (e) {}
    }
  }

  function renderTable(container, result, label) {
    const wrap = document.createElement('div');
    wrap.className = 'sql-result-block';
    if (label) {
      const h = document.createElement('div');
      h.className = 'sql-result-label';
      h.textContent = label;
      wrap.appendChild(h);
    }
    if (result && result.error) {
      const pre = document.createElement('pre');
      pre.className = 'sql-error';
      pre.textContent = result.error;
      wrap.appendChild(pre);
      container.appendChild(wrap);
      return;
    }
    const cols = (result && result.columns) || [];
    const rows = (result && result.values) || [];
    if (cols.length === 0 && rows.length === 0) {
      const p = document.createElement('p');
      p.className = 'sql-empty';
      p.textContent = 'Thực thi thành công (không có kết quả trả về).';
      wrap.appendChild(p);
      container.appendChild(wrap);
      return;
    }
    const table = document.createElement('table');
    table.className = 'sql-table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    cols.forEach(function (c) {
      const th = document.createElement('th');
      th.textContent = c;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      row.forEach(function (cell) {
        const td = document.createElement('td');
        td.textContent = (cell === null || cell === undefined) ? 'NULL' : String(cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }

  const SqlEngine = {
    ensureLoaded: ensureLoaded,
    escapeHtml: escapeHtml,
    createDb: createDb,
    splitStatements: splitStatements,
    isSelectOnly: isSelectOnly,
    run: run,
    normalizeValue: normalizeValue,
    compareResults: compareResults,
    grade: grade,
    preview: preview,
    renderTable: renderTable,
    getSetupSql: getSetupSql,
  };

  global.SqlEngine = SqlEngine;
})(window);