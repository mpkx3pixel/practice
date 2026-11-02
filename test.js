
const Test = {
  cache: {},

  async render(container, exercise) {
    container.innerHTML = '';

    const status = el('p', 'outline-status');
    status.textContent = 'Đang tải đề kiểm tra…';
    container.appendChild(status);

    try {
      const sections = await this.loadSections(exercise);

      // Làm phẳng theo thứ tự section; mỗi section đảo thứ tự câu hỏi bên trong
      const questions = [];
      sections.forEach(({ section, list }, sectionIndex) => {
        const shuffled = shuffle([...list]);
        shuffled.forEach((item) => {
          questions.push({
            type: Practice.detectType(item, section.title),
            sectionTitle: section.title || '',
            sectionIndex,
            item,
          });
        });
      });

      status.remove();

      if (questions.length === 0) {
        status.textContent = 'Đề này chưa có câu hỏi.';
        container.appendChild(status);
        return;
      }

      this.state = {
        exercise,
        sections,
        questions,
        answers: questions.map(() => null),
        bookmarks: questions.map(() => false),
        results: questions.map(() => null),
        submitted: false,
        current: 0,
        pages: Practice.computePages(questions.length),
        palPage: 0,
        filter: 'all',
      };

      this.buildLayout(container);
    } catch (err) {
      status.textContent = 'Không thể tải đề kiểm tra.';
      console.error(err);
    }
  },

  async loadSections(exercise) {
    const loaded = [];

    for (const section of exercise.sections || []) {
      let list;

      if (this.cache[section.file_path]) {
        list = this.cache[section.file_path];
      } else {
        const res = await fetch(section.file_path);
        if (!res.ok) throw new Error(`${section.file_path}: ${res.statusText}`);
        list = await res.json();
        this.cache[section.file_path] = list;
      }

      loaded.push({ section, list });
    }

    return loaded;
  },

  buildLayout(container) {
    const s = this.state;

    container.innerHTML = '';
    const wrap = el('div', 'practice-wrap');
    const main = el('div', 'practice-main');
    const side = el('div', 'practice-side');
    wrap.append(main, side);
    container.appendChild(wrap);

    this.refs = { container, main, side };
    this.renderMain();
    this.renderSide();
  },


  isAnswered(i) {
    const s = this.state;
    const a = s.answers[i];
    if (!a) return false;
    const type = s.questions[i].type;

    if (type === 'mcq') return a.choice !== null && a.choice !== undefined;
    if (type === 'tf') return Array.isArray(a.choices) && a.choices.every((v) => v !== null);
    if (type === 'sql') return String(a.value ?? '').trim() !== '';
    return String(a.value ?? '').trim() !== '';
  },

  answeredCount() {
    const s = this.state;
    let n = 0;
    for (let i = 0; i < s.questions.length; i++) {
      if (this.isAnswered(i)) n++;
    }
    return n;
  },

  goTo(i) {
    const s = this.state;
    s.current = i;
    const p = s.pages.findIndex((r) => i >= r.start && i < r.end);
    if (p >= 0) s.palPage = p;
    this.renderMain();
    this.renderSide();
  },


  renderMain() {
    const { main } = this.refs;
    const s = this.state;
    main.innerHTML = '';

    const i = s.current;
    const q = s.questions[i];

    const top = el('div', 'practice-top');
    const label = el('span', 'practice-section-label');
    label.textContent = q.sectionTitle;

    const right = el('div', 'practice-top-right');
    const bm = el('button', s.bookmarks[i] ? 'bm-btn active' : 'bm-btn');
    bm.type = 'button';
    bm.textContent = '🔖';
    bm.title = s.bookmarks[i] ? 'Bỏ đánh dấu câu này' : 'Đánh dấu câu này';
    bm.addEventListener('click', () => {
      s.bookmarks[i] = !s.bookmarks[i];
      this.renderMain();
      this.renderSide();
    });
    const count = el('span', 'practice-count');
    count.textContent = `${this.answeredCount()} / ${s.questions.length}`;
    right.append(bm, count);
    top.append(label, right);
    main.appendChild(top);

    const badges = el('div', 'practice-badges');
    const b = el('span', 'p-badge answered');
    b.textContent = `Đã làm: ${this.answeredCount()}`;
    badges.appendChild(b);
    main.appendChild(badges);

    const bar = el('div', 'practice-bar');
    const fill = el('div', 'practice-bar-fill');
    fill.style.width = `${(this.answeredCount() / s.questions.length) * 100}%`;
    bar.appendChild(fill);
    main.appendChild(bar);

    const body = el('div');
    if (q.type === 'mcq') this.renderMCQ(body, i);
    else if (q.type === 'tf') this.renderTF(body, i);
    else if (q.type === 'sql') this.renderSQL(body, i);
    else this.renderText(body, i, q.type);
    main.appendChild(body);

    const submit = el('button', 'practice-check submit-btn');
    submit.type = 'button';
    submit.textContent = 'Nộp bài — kiểm tra kết quả';
    submit.disabled = this.answeredCount() === 0;
    submit.addEventListener('click', () => this.submit());
    main.appendChild(submit);
  },

  renderMCQ(buffer, i) {
    const s = this.state;
    const q = s.questions[i].item;

    const qtext = el('p', 'practice-qtext');
    qtext.textContent = q.q;
    buffer.appendChild(qtext);

    appendQuestionImage(buffer, q);

    const opts = el('div', 'practice-opts');
    q.options.forEach((text, li) => {
      const opt = el('button', 'practice-opt');
      opt.type = 'button';

      const letter = el('span', 'opt-letter');
      letter.textContent = `${Practice.letters[li]}.`;
      const textEl = el('span', 'opt-text');
      textEl.textContent = text;
      opt.append(letter, textEl);

      if (s.answers[i]?.choice === li) opt.classList.add('selected');

      opt.addEventListener('click', () => {
        const a = (s.answers[i] ||= { choice: null });
        a.choice = a.choice === li ? null : li; 
        this.renderMain();
        this.renderSide();
      });

      opts.appendChild(opt);
    });
    buffer.appendChild(opts);
  },

  renderTF(buffer, i) {
    const s = this.state;
    const q = s.questions[i].item;

    const passage = el('p', 'practice-passage');
    passage.textContent = stripNumbering(q.title);
    buffer.appendChild(passage);

    appendQuestionImage(buffer, q);

    q.items.forEach((it, yi) => {
      const row = el('div', 'tf-row');
      const text = el('span', 'tf-text');
      text.textContent = it.t;
      row.appendChild(text);

      const choices = el('div', 'tf-choices');
      for (const val of [true, false]) {
        const btn = el('button', 'tf-btn');
        btn.type = 'button';
        btn.textContent = val ? 'Đúng' : 'Sai';
        if (s.answers[i]?.choices[yi] === val) btn.classList.add('active');

        btn.addEventListener('click', () => {
          const a = (s.answers[i] ||= { choices: q.items.map(() => null) });
          a.choices[yi] = a.choices[yi] === val ? null : val;
          this.renderMain();
          this.renderSide();
        });

        choices.appendChild(btn);
      }
      row.appendChild(choices);
      buffer.appendChild(row);
    });
  },

  renderSQL(buffer, i) {
    const s = this.state;
    const q = s.questions[i].item;

    const qtext = el('p', 'practice-qtext');
    qtext.textContent = q.q;
    buffer.appendChild(qtext);

    appendQuestionImage(buffer, q);

    const dataBox = document.createElement('div');
    dataBox.className = 'sql-result';
    buffer.appendChild(dataBox);
    SqlEngine.renderInitialData(dataBox, SqlEngine.getSetupSql(q));

    const form = el('div', 'practice-form');
    const field = document.createElement('textarea');
    field.className = 'practice-input sql-editor';
    field.rows = 5;
    field.placeholder = 'Nhập lệnh SQL…';
    field.value = s.answers[i]?.value ?? '';

    field.addEventListener('input', (e) => {
      const a = (s.answers[i] ||= { value: '' });
      const was = this.isAnswered(i);
      a.value = e.target.value;
      if (this.isAnswered(i) !== was) {
        const cnt = document.querySelector('.practice-count');
        if (cnt) cnt.textContent = `${this.answeredCount()} / ${s.questions.length}`;
        const badge = document.querySelector('.p-badge.answered');
        if (badge) badge.textContent = `Đã làm: ${this.answeredCount()}`;
        const submitBtn = document.querySelector('.submit-btn');
        if (submitBtn) submitBtn.disabled = this.answeredCount() === 0;
        this.renderSide();
      }
    });

    const resultBox = document.createElement('div');
    resultBox.className = 'sql-result';

    const runBtn = el('button', 'practice-check');
    runBtn.type = 'button';
    runBtn.textContent = 'Chạy';
    runBtn.addEventListener('click', async () => {
      resultBox.innerHTML = '';
      const sql = field.value;
      (s.answers[i] ||= { value: '' }).value = sql;
      let db = null;
      try {
        db = await SqlEngine.createDb(SqlEngine.getSetupSql(q));
        const res = SqlEngine.run(db, sql);
        SqlEngine.renderTable(resultBox, res, 'Kết quả:');
      } catch (e) {
        SqlEngine.renderTable(resultBox, { error: (e && e.message) ? e.message : String(e) }, 'Lỗi:');
      } finally {
        try { if (db) db.close(); } catch (e) {}
      }
    });

    form.append(field, runBtn, resultBox);
    buffer.appendChild(form);
  },

  renderText(buffer, i, type) {
    const s = this.state;
    const q = s.questions[i].item;

    const qtext = el('p', 'practice-qtext');
    qtext.textContent = q.q;
    buffer.appendChild(qtext);

    appendQuestionImage(buffer, q);

    const dataBox = document.createElement('div');
    dataBox.className = 'sql-result';
    buffer.appendChild(dataBox);
    SqlEngine.renderInitialData(dataBox, SqlEngine.getSetupSql(q));

    const form = el('div', 'practice-form');
    const field = type === 'essay' ? el('textarea', 'practice-input') : el('input', 'practice-input');
    if (type === 'essay') {
      field.rows = 5;
      field.placeholder = 'Viết câu trả lời của bạn…';
    } else {
      field.type = 'text';
      field.placeholder = 'Nhập câu trả lời…';
    }
    field.value = s.answers[i]?.value ?? '';

    field.addEventListener('input', (e) => {
      const a = (s.answers[i] ||= { value: '' });
      const was = this.isAnswered(i);
      a.value = e.target.value;
      if (this.isAnswered(i) !== was) {
        const cnt = document.querySelector('.practice-count');
        if (cnt) cnt.textContent = `${this.answeredCount()} / ${s.questions.length}`;
        const badge = document.querySelector('.p-badge.answered');
        if (badge) badge.textContent = `Đã làm: ${this.answeredCount()}`;
        const submitBtn = document.querySelector('.submit-btn');
        if (submitBtn) submitBtn.disabled = this.answeredCount() === 0;
        this.renderSide();
      }
    });

    form.appendChild(field);
    buffer.appendChild(form);
  },


  renderSide() {
    const { side } = this.refs;
    const s = this.state;
    side.innerHTML = '';

    // Chip chọn nhóm câu
    if (s.pages.length > 1) {
      const groups = el('div', 'pal-groups');
      for (let p = 0; p < s.pages.length; p++) {
        const chip = el('button', p === s.palPage ? 'pal-page active' : 'pal-page');
        chip.type = 'button';
        chip.textContent = p + 1;
        chip.title = `Câu ${s.pages[p].start + 1}–${s.pages[p].end}`;
        chip.addEventListener('click', () => {
          s.palPage = p;
          this.renderSide();
        });
        groups.appendChild(chip);
      }
      side.appendChild(groups);
    }

    const range = s.pages[s.palPage];
    const grid = el('div', 'pal-grid');
    for (let i = range.start; i < range.end; i++) {
      const b = el('button', 'pal');
      b.type = 'button';
      b.textContent = i + 1;

      if (s.submitted) {
        const r = s.results[i];
        if (r) b.classList.add(r);
      } else if (this.isAnswered(i)) {
        b.classList.add('answered'); 
      }
      if (s.bookmarks[i]) b.classList.add('bookmarked');
      if (i === s.current) b.classList.add('current');

      b.addEventListener('click', () => this.goTo(i));
      grid.appendChild(b);
    }
    side.appendChild(grid);

    const nav = el('div', 'pal-nav');
    const mk = (label, target) => {
      const btn = el('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.disabled = target === s.current;
      btn.addEventListener('click', () => this.goTo(target));
      return btn;
    };
    const pager = el('span', 'pal-pager');
    pager.textContent = `${s.current + 1} / ${s.questions.length}`;
    nav.append(
      mk('«', 0),
      mk('←', Math.max(0, s.current - 1)),
      pager,
      mk('→', Math.min(s.questions.length - 1, s.current + 1)),
      mk('»', s.questions.length - 1)
    );
    side.appendChild(nav);
  },


  async submit() {
    const s = this.state;

    await Promise.all(s.questions.map(async (q, i) => {
      if (q.type === 'essay') {
        s.results[i] = null;
        return;
      }

      if (!this.isAnswered(i)) {
        s.results[i] = 'skipped';
        return;
      }

      if (q.type === 'mcq') {
        s.results[i] = q.item.options[s.answers[i].choice] === q.item.a ? 'correct' : 'wrong';
      } else if (q.type === 'tf') {
        s.results[i] = q.item.items.every((it, k) => s.answers[i].choices[k] === it.a)
          ? 'correct'
          : 'wrong';
      } else if (q.type === 'sql') {
        const res = await SqlEngine.grade(q.item, s.answers[i].value);
        (s.answers[i] ||= {}).gradeResult = res;
        s.results[i] = res.correct ? 'correct' : 'wrong';
      } else {
        s.results[i] =
          String(s.answers[i].value).trim() === String(q.item.a).trim() ? 'correct' : 'wrong';
      }
    }));

    s.submitted = true;
    this.renderResults();
  },

  renderResults() {
    const s = this.state;
    const c = this.refs.container;
    c.innerHTML = '';

    const back = el('button', 'back-btn');
    back.type = 'button';
    back.textContent = '← Quay lại bài làm';
    back.addEventListener('click', () => {
      s.submitted = false;
      this.buildLayout(c);
    });
    c.appendChild(back);

    const gradable = s.questions.filter((q) => q.type !== 'essay').length;
    const correct = s.results.filter((r) => r === 'correct').length;
    const wrong = s.results.filter((r) => r === 'wrong').length;
    const skipped = s.results.filter((r) => r === 'skipped').length;
    const essay = s.questions.length - gradable;
    const score = gradable > 0 ? Math.round((10 * correct) / gradable * 100) / 100 : null;

    const board = el('div', 'test-scoreboard');
    const value = el('div', 'test-score-value');
    value.textContent = score === null ? 'Không có câu chấm điểm' : `${score} / 10`;
    const line = el('p', 'test-score-line');
    line.textContent =
      `Đúng: ${correct} · Sai: ${wrong} · Chưa làm: ${skipped}` +
      (essay > 0 ? ` · Tự luận: ${essay} câu (không chấm)` : '');
    board.append(value, line);
    c.appendChild(board);

    const filters = el('div', 'test-filters');
    const mkFilter = (id, label) => {
      const chip = el('button', s.filter === id ? 'pal-page active' : 'pal-page');
      chip.type = 'button';
      chip.textContent = label;
      chip.addEventListener('click', () => {
        s.filter = id;
        this.renderResults();
      });
      filters.appendChild(chip);
    };
    mkFilter('all', `Tất cả (${s.questions.length})`);
    if (correct > 0) mkFilter('correct', `Đúng (${correct})`);
    if (wrong > 0) mkFilter('wrong', `Sai (${wrong})`);
    if (skipped > 0) mkFilter('skipped', `Chưa làm (${skipped})`);
    c.appendChild(filters);

    const list = el('div', 'test-results');
    let lastSection = -1;

    s.questions.forEach((q, i) => {
      if (s.filter === 'correct' && s.results[i] !== 'correct') return;
      if (s.filter === 'wrong' && s.results[i] !== 'wrong') return;
      if (s.filter === 'skipped' && s.results[i] !== 'skipped') return;
      // câu tự luận chỉ hiện trong tab "Tất cả"

      if (q.sectionIndex !== lastSection) {
        lastSection = q.sectionIndex;
        const h = el('h2', 'section-title');
        h.textContent = q.sectionTitle;
        list.appendChild(h);
      }

      list.appendChild(this.renderResultQuestion(q, i));
    });

    c.appendChild(list);
  },

  renderResultQuestion(q, i) {
    const s = this.state;
    const r = s.results[i];

    const card = el('article', 'question');

    const head = el('div', 'res-qhead');
    const num = el('span', 'res-qnum');
    num.textContent = `Câu ${i + 1}`;
    const badge = el('span', `res-badge ${r ?? 'none'}`);
    badge.textContent =
      r === 'correct'
        ? 'Đúng'
        : r === 'wrong'
          ? 'Sai'
          : r === 'skipped'
            ? 'Chưa làm'
            : 'Tự luận · không chấm';
    head.append(num, badge);
    card.appendChild(head);

    if (q.type === 'mcq') {
      const qt = el('p', 'q-text');
      qt.textContent = q.item.q;
      card.appendChild(qt);

      appendQuestionImage(card, q.item);

      const answerIndex = q.item.options.indexOf(q.item.a);
      q.item.options.forEach((text, li) => {
        const row = el('div', 'option-row');
        if (li === answerIndex) row.classList.add('res-correct');
        if (s.answers[i]?.choice === li && li !== answerIndex) row.classList.add('res-wrong');

        const letter = el('span', 'opt-letter');
        letter.textContent = `${Practice.letters[li]}.`;
        const textEl = el('span', 'opt-text');
        textEl.textContent = text;
        row.append(letter, textEl);
        card.appendChild(row);
      });
      return card;
    }

    if (q.type === 'tf') {
      const passage = el('p', 'q-passage');
      passage.textContent = stripNumbering(q.item.title);
      card.appendChild(passage);

      appendQuestionImage(card, q.item);

      q.item.items.forEach((it, yi) => {
        const user = s.answers[i]?.choices?.[yi] ?? null;
        const row = el(
          'div',
          user === null ? 'tf-eval skipped' : user === it.a ? 'tf-eval res-correct' : 'tf-eval res-wrong'
        );

        const text = el('span', 'tf-text');
        text.textContent = it.t;
        row.appendChild(text);

        const meta = el('span', 'tf-eval-meta');
        const picked = el('span');
        picked.textContent = user === null ? 'Bạn chưa chọn' : `Bạn chọn: ${user ? 'Đúng' : 'Sai'}`;
        const actual = el('span', `tf-badge ${it.a ? 'true' : 'false'}`);
        actual.textContent = it.a ? 'Đúng' : 'Sai';
        meta.append(picked, actual);
        row.appendChild(meta);
        card.appendChild(row);
      });
      return card;
    }

    if (q.type === 'sql') {
      const qt = el('p', 'q-text');
      qt.textContent = q.item.q;
      card.appendChild(qt);

      appendQuestionImage(card, q.item);

      const ua = el('p', 'res-user');
      const userValue = String(s.answers[i]?.value ?? '').trim();
      ua.textContent = userValue ? `Bạn trả lời: ${s.answers[i].value}` : 'Bạn chưa trả lời.';
      card.appendChild(ua);

      const resultBox = document.createElement('div');
      resultBox.className = 'sql-result';
      const g = s.answers[i]?.gradeResult;
      if (g) {
        if (g.userResult) SqlEngine.renderTable(resultBox, g.userResult, 'Bạn chạy:');
        if (!g.correct && g.answerResult) SqlEngine.renderTable(resultBox, g.answerResult, 'Đáp án mẫu:');
        if (g.error) SqlEngine.renderTable(resultBox, { error: g.error }, 'Lỗi:');
      }
      card.appendChild(resultBox);

      this.appendAnswerRow(card, q.item.answer || q.item.answerSql || '');
      return card;
    }

    // Trả lời ngắn & tự luận
    const qt = el('p', 'q-text');
    qt.textContent = q.item.q;
    card.appendChild(qt);

    appendQuestionImage(card, q.item);

    const ua = el('p', 'res-user');
    const userValue = String(s.answers[i]?.value ?? '').trim();
    ua.textContent = userValue ? `Bạn trả lời: ${s.answers[i].value}` : 'Bạn chưa trả lời.';
    card.appendChild(ua);

    this.appendAnswerRow(card, q.item.a);
    return card;
  },

  appendAnswerRow(buffer, answer) {
    const row = el('div', 'answer-row');
    const label = el('span', 'answer-label');
    label.textContent = 'Đáp án';
    const text = el('span', 'answer-text');
    text.textContent = answer;
    row.append(label, text);
    buffer.appendChild(row);
  },
};

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
