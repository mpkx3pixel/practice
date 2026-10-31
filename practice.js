
const Practice = {
  cache: {},
  letters: 'ABCDEFGH',
  state: null,
  refs: null,

  async render(container, exercise) {
    container.innerHTML = '';

    const status = el('p', 'outline-status');
    status.textContent = 'Đang tải bài ôn tập…';
    container.appendChild(status);

    try {
      const sections = await this.loadSections(exercise);

      const questions = [];
      for (const { section, list } of sections) {
        for (const item of list) {
          questions.push({
            type: this.detectType(item, section.title),
            sectionTitle: section.title || '',
            item,
          });
        }
      }

      status.remove();

      if (questions.length === 0) {
        status.textContent = 'Đề này chưa có câu hỏi.';
        container.appendChild(status);
        return;
      }

      this.state = {
        questions,
        answers: questions.map(() => null), 
        results: questions.map(() => null), 
        current: 0,
        pages: this.computePages(questions.length),
        palPage: 0,
      };

      container.innerHTML = '';
      const wrap = el('div', 'practice-wrap');
      const main = el('div', 'practice-main');
      const side = el('div', 'practice-side');
      wrap.append(main, side);
      container.appendChild(wrap);

      this.refs = { main, side };
      this.renderMain();
      this.renderSide();
    } catch (err) {
      status.textContent = 'Không thể tải bài ôn tập.';
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

  detectType(item, sectionTitle) {
    if (Array.isArray(item.items)) return 'tf';
    if (Array.isArray(item.options) && item.options.length > 0) return 'mcq';
    if (/tự luận|tu luan/i.test(sectionTitle || '')) return 'essay';
    return 'qa';
  },

  PAGE_SIZE: 30,

  computePages(total) {
    if (total <= this.PAGE_SIZE) return [{ start: 0, end: total }];

    const ranges = [{ start: 0, end: this.PAGE_SIZE }];
    const rest = total - this.PAGE_SIZE;
    const count = Math.ceil(rest / this.PAGE_SIZE);
    const base = Math.floor(rest / count);
    const extra = rest % count;

    let start = this.PAGE_SIZE;
    for (let i = 0; i < count; i++) {
      const size = base + (i < extra ? 1 : 0);
      ranges.push({ start, end: start + size });
      start += size;
    }
    return ranges;
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

    const q = s.questions[s.current];
    const answered = s.results.filter(Boolean).length;

    const top = el('div', 'practice-top');
    const label = el('span', 'practice-section-label');
    label.textContent = q.sectionTitle;
    const count = el('span', 'practice-count');
    count.textContent = `${answered} / ${s.questions.length}`;
    top.append(label, count);
    main.appendChild(top);

    const badges = el('div', 'practice-badges');
    const correctCount = s.results.filter((r) => r === 'correct').length;
    const wrongCount = s.results.filter((r) => r === 'wrong').length;
    const b1 = el('span', 'p-badge correct');
    b1.textContent = `Đúng: ${correctCount}`;
    badges.appendChild(b1);
    if (wrongCount > 0) {
      const b2 = el('span', 'p-badge wrong');
      b2.textContent = `Sai: ${wrongCount}`;
      badges.appendChild(b2);
    }
    main.appendChild(badges);

    const bar = el('div', 'practice-bar');
    const fill = el('div', 'practice-bar-fill');
    fill.style.width = `${(answered / s.questions.length) * 100}%`;
    bar.appendChild(fill);
    main.appendChild(bar);

    const body = el('div');
    if (q.type === 'mcq') this.renderMCQ(body, q, s.current);
    else if (q.type === 'tf') this.renderTF(body, q, s.current);
    else if (q.type === 'qa') this.renderQA(body, q, s.current);
    else this.renderEssay(body, q, s.current);
    main.appendChild(body);
  },

  renderMCQ(buffer, q, i) {
    const s = this.state;
    const graded = s.results[i] !== null;

    const qtext = el('p', 'practice-qtext');
    qtext.textContent = q.item.q;
    buffer.appendChild(qtext);

    appendQuestionImage(buffer, q.item);

    const opts = el('div', 'practice-opts');
    const answerIndex = q.item.options.indexOf(q.item.a);

    q.item.options.forEach((text, li) => {
      const opt = el('button', 'practice-opt');
      opt.type = 'button';

      const letter = el('span', 'opt-letter');
      letter.textContent = `${this.letters[li]}.`;
      const textEl = el('span', 'opt-text');
      textEl.textContent = text;
      opt.append(letter, textEl);

      if (graded) {
        opt.disabled = true;
        if (li === answerIndex) opt.classList.add('is-correct');
        else if (li === s.answers[i].choice) opt.classList.add('is-wrong');
      } else {
        opt.addEventListener('click', () => this.answerMCQ(i, li));
      }

      opts.appendChild(opt);
    });
    buffer.appendChild(opts);

    if (graded) this.appendFeedback(buffer, i);
  },

  answerMCQ(i, li) {
    const s = this.state;
    if (s.results[i] !== null) return;
    s.answers[i] = { choice: li };
    s.results[i] = s.questions[i].item.options[li] === s.questions[i].item.a ? 'correct' : 'wrong';
    this.renderMain();
    this.renderSide();
  },

  renderTF(buffer, q, i) {
    const s = this.state;
    const graded = s.results[i] !== null;

    const passage = el('p', 'practice-passage');
    passage.textContent = stripNumbering(q.item.title);
    buffer.appendChild(passage);

    appendQuestionImage(buffer, q.item);

    q.item.items.forEach((it, yi) => {
      const row = el('div', 'tf-row');
      const text = el('span', 'tf-text');
      text.textContent = it.t;
      row.appendChild(text);

      if (graded) {
        row.classList.add(s.answers[i].choices[yi] === it.a ? 'is-correct' : 'is-wrong');
        if (s.answers[i].choices[yi] !== it.a) {
          const actual = el('span', 'tf-actual');
          actual.textContent = `Đáp án: ${it.a ? 'Đúng' : 'Sai'}`;
          row.appendChild(actual);
        }
      } else {
        const choices = el('div', 'tf-choices');
        for (const val of [true, false]) {
          const btn = el('button', 'tf-btn');
          btn.type = 'button';
          btn.textContent = val ? 'Đúng' : 'Sai';
          if (s.answers[i]?.choices[yi] === val) btn.classList.add('active');
          btn.addEventListener('click', () => this.selectTF(i, yi, val));
          choices.appendChild(btn);
        }
        row.appendChild(choices);
      }

      buffer.appendChild(row);
    });

    if (graded) this.appendFeedback(buffer, i);
  },

  selectTF(i, yi, val) {
    const s = this.state;
    if (s.results[i] !== null) return;

    if (!s.answers[i]) {
      s.answers[i] = { choices: s.questions[i].item.items.map(() => null) };
    }
    s.answers[i].choices[yi] = val;

    if (s.answers[i].choices.every((v) => v !== null)) {
      
      const allCorrect = s.questions[i].item.items.every(
        (it, k) => s.answers[i].choices[k] === it.a
      );
      s.results[i] = allCorrect ? 'correct' : 'wrong';
      this.renderMain();
      this.renderSide();
    } else {
      this.renderMain();
    }
  },

  renderQA(buffer, q, i) {
    const s = this.state;
    const graded = s.results[i] !== null;

    const qtext = el('p', 'practice-qtext');
    qtext.textContent = q.item.q;
    buffer.appendChild(qtext);

    appendQuestionImage(buffer, q.item);

    if (!graded) {
      const form = el('div', 'practice-form');
      const input = el('input', 'practice-input');
      input.type = 'text';
      input.placeholder = 'Nhập câu trả lời…';

      const submit = () => this.submitQA(i, input);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });

      const btn = el('button', 'practice-check');
      btn.type = 'button';
      btn.textContent = 'Kiểm tra';
      btn.addEventListener('click', submit);

      form.append(input, btn);
      buffer.appendChild(form);
    } else {
      const input = el('input', 'practice-input');
      input.type = 'text';
      input.value = s.answers[i].value;
      input.disabled = true;
      buffer.appendChild(input);

      this.appendAnswerRow(buffer, q.item.a);
      this.appendFeedback(buffer, i);
    }
  },

  submitQA(i, input) {
    const s = this.state;
    if (s.results[i] !== null) return;
    s.answers[i] = { value: input.value };
    
    s.results[i] = input.value.trim() === s.questions[i].item.a.trim() ? 'correct' : 'wrong';
    this.renderMain();
    this.renderSide();
  },

  renderEssay(buffer, q, i) {
    const s = this.state;
    const viewed = s.results[i] !== null;

    const qtext = el('p', 'practice-qtext');
    qtext.textContent = q.item.q;
    buffer.appendChild(qtext);

    appendQuestionImage(buffer, q.item);

    if (!viewed) {
      const form = el('div', 'practice-form');
      const ta = el('textarea', 'practice-input');
      ta.rows = 5;
      ta.placeholder = 'Viết câu trả lời của bạn…';

      const btn = el('button', 'practice-check');
      btn.type = 'button';
      btn.textContent = 'Hiện đáp án';
      btn.addEventListener('click', () => this.viewEssay(i, ta));

      form.append(ta, btn);
      buffer.appendChild(form);
    } else {
      const ta = el('textarea', 'practice-input');
      ta.rows = 5;
      ta.value = s.answers[i].value;
      ta.disabled = true;
      buffer.appendChild(ta);

      this.appendAnswerRow(buffer, q.item.a);
      this.appendFeedback(buffer, i);
    }
  },

  viewEssay(i, ta) {
    const s = this.state;
    if (s.results[i] !== null) return;
    s.answers[i] = { value: ta.value };
    s.results[i] = 'viewed';
    this.renderMain();
    this.renderSide();
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

  appendFeedback(buffer, i) {
    const r = this.state.results[i];
    if (!r) return;
    const fb = el('p', `practice-feedback ${r}`);
    fb.textContent =
      r === 'correct' ? '✔ Chính xác!' : r === 'viewed' ? 'Đã hiển thị đáp án.' : '✘ Chưa đúng.';
    buffer.appendChild(fb);
  },

 

  renderSide() {
    const { side } = this.refs;
    const s = this.state;
    side.innerHTML = '';

    const pageCount = s.pages.length;

    
    if (pageCount > 1) {
      const groups = el('div', 'pal-groups');
      for (let p = 0; p < pageCount; p++) {
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

      const r = s.results[i];
      if (r) b.classList.add(r);
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
};

function stripNumbering(text) {
  return (text || '').replace(/^Câu\s*\d+\.\s*/, '');
}

/**
 * Chèn ảnh câu hỏi nếu dữ liệu có trường `img` (URL tuyệt đối hoặc
 * đường dẫn tương đối, ví dụ "exercises/001/images/q5.png").
 * Cả outline.js và test.js đều dùng hàm này.
 */
function appendQuestionImage(buffer, item) {
  if (!item || !item.img) return;
  const fig = el('figure', 'q-image');
  const img = el('img');
  img.src = item.img;
  img.alt = item.q ? item.q.slice(0, 100) : 'Hình minh họa câu hỏi';
  img.loading = 'lazy';
  fig.appendChild(img);
  buffer.appendChild(fig);
}
