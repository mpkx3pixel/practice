const Outline = {
  cache: {},

  async render(container, exercise) {
    container.innerHTML = '';

    const status = document.createElement('p');
    status.className = 'outline-status';
    status.textContent = 'Đang tải đề cương…';
    container.appendChild(status);

    try {
      const sections = await this.loadSections(exercise);
      status.remove();

      for (const { section, questions } of sections) {
        container.appendChild(this.renderSection(section, questions));
      }
    } catch (err) {
      status.textContent = 'Không thể tải nội dung đề cương.';
      console.error(err);
    }
  },

  async loadSections(exercise) {
    const loaded = [];

    for (const section of exercise.sections || []) {
      let questions;

      if (this.cache[section.file_path]) {
        questions = this.cache[section.file_path];
      } else {
        const res = await fetch(section.file_path);
        if (!res.ok) throw new Error(`${section.file_path}: ${res.statusText}`);
        questions = await res.json();
        this.cache[section.file_path] = questions;
      }

      loaded.push({ section, questions });
    }

    return loaded;
  },

  renderSection(section, questions) {
    const block = document.createElement('div');
    block.className = 'section-block';

    const title = document.createElement('h2');
    title.className = 'section-title';
    title.textContent = section.title;
    block.appendChild(title);

    const list = document.createElement('div');
    list.className = 'questions';

    questions.forEach((item, index) => {
      list.appendChild(this.renderQuestion(item, index));
    });

    block.appendChild(list);
    return block;
  },
  renderQuestion(item, index) {
    if (item && item.type === 'sql') return this.renderSql(item, index);
    if (Array.isArray(item.items)) return this.renderTrueFalse(item, index);
    if (Array.isArray(item.options) && item.options.length > 0) return this.renderMCQ(item, index);
    return this.renderAnswerOnly(item, index);
  },

  renderMCQ(item, index) {
    const card = el('article', 'question');

    const q = el('p', 'q-text');
    q.textContent = `Câu ${index + 1}. ${item.q}`;
    card.appendChild(q);

    appendQuestionImage(card, item);

    const letters = 'ABCDEFGH';
    const answerIndex = Array.isArray(item.options) ? item.options.indexOf(item.a) : -1;

    item.options.forEach((text, i) => {
      const row = el('div', 'option-row');
      if (i === answerIndex) row.classList.add('correct');

      const letter = el('span', 'opt-letter');
      letter.textContent = `${letters[i]}.`;

      const optionText = el('span', 'opt-text');
      optionText.textContent = text;

      row.append(letter, optionText);
      card.appendChild(row);
    });

    return card;
  },

  renderTrueFalse(item, index) {
    const card = el('article', 'question');

    const passage = el('p', 'q-passage');
    passage.textContent = item.title || `Câu ${index + 1}.`;
    card.appendChild(passage);

    appendQuestionImage(card, item);

    for (const item_ of item.items) {
      const row = el('div', 'tf-item');
      if (item_.a) row.classList.add('correct');

      const badge = el('span', `tf-badge ${item_.a ? 'true' : 'false'}`);
      badge.textContent = item_.a ? 'Đúng' : 'Sai';

      const text = el('span');
      text.textContent = item_.t;

      row.append(badge, text);
      card.appendChild(row);
    }

    return card;
  },

  renderSql(item, index) {
    const card = el('article', 'question');

    const q = el('p', 'q-text');
    q.textContent = `Câu ${index + 1}. ${item.q}`;
    card.appendChild(q);

    const dataBox = document.createElement('div');
    dataBox.className = 'sql-result';
    card.appendChild(dataBox);
    SqlEngine.renderInitialData(dataBox, item.setupSql || item.initSql || item.schema || '');

    const answer = el('div', 'answer-row');
    const label = el('span', 'answer-label');
    label.textContent = 'Đáp án (SQL)';
    const answerText = el('span', 'answer-text');
    answerText.textContent = item.answer || item.answerSql || '';
    answer.append(label, answerText);
    card.appendChild(answer);

    const tryBox = document.createElement('div');
    tryBox.className = 'sql-result';
    const tryLabel = document.createElement('div');
    tryLabel.className = 'sql-result-label';
    tryLabel.textContent = 'Chạy thử:';
    tryBox.appendChild(tryLabel);

    const ta = document.createElement('textarea');
    ta.className = 'practice-input sql-editor';
    ta.rows = 4;
    ta.spellcheck = false;
    ta.value = item.answer || item.answerSql || '';
    tryBox.appendChild(ta);

    const btn = el('button', 'practice-check');
    btn.type = 'button';
    btn.textContent = 'Chạy';
    const resBox = document.createElement('div');
    resBox.className = 'sql-result';
    btn.addEventListener('click', async () => {
      resBox.innerHTML = '';
      let db = null;
      try {
        db = await SqlEngine.createDb(SqlEngine.getSetupSql(item));
        const r = SqlEngine.run(db, ta.value);
        SqlEngine.renderTable(resBox, r, 'Kết quả:');
      } catch (e) {
        SqlEngine.renderTable(resBox, { error: (e && e.message) ? e.message : String(e) }, 'Lỗi:');
      } finally {
        try { if (db) db.close(); } catch (err) {}
      }
    });
    tryBox.appendChild(btn);
    tryBox.appendChild(resBox);
    card.appendChild(tryBox);

    return card;
  },

  renderAnswerOnly(item, index) {
    const card = el('article', 'question');

    const q = el('p', 'q-text');
    q.textContent = `Câu ${index + 1}. ${item.q}`;
    card.appendChild(q);

    appendQuestionImage(card, item);

    const answer = el('div', 'answer-row');

    const label = el('span', 'answer-label');
    label.textContent = 'Đáp án';

    const answerText = el('span', 'answer-text');
    answerText.textContent = item.a;

    answer.append(label, answerText);
    card.appendChild(answer);

    return card;
  },
};

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
