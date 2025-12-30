// 漢字テスト（読み＋書き混合）
// データ：questions.json
// 保存：localStorage（間違えた漢字の回数）

const els = {
  startCard: document.getElementById('startCard'),
  quizCard: document.getElementById('quizCard'),
  resultCard: document.getElementById('resultCard'),
  qCount: document.getElementById('qCount'),
  writeRatio: document.getElementById('writeRatio'),
  startBtn: document.getElementById('startBtn'),
  resetBtn: document.getElementById('resetBtn'),
  setInfo: document.getElementById('setInfo'),
  scoreInfo: document.getElementById('scoreInfo'),

  qType: document.getElementById('qType'),
  qNum: document.getElementById('qNum'),
  prompt: document.getElementById('prompt'),
  choices: document.getElementById('choices'),
  writeArea: document.getElementById('writeArea'),
  writeInput: document.getElementById('writeInput'),
  writeHint: document.getElementById('writeHint'),

  feedback: document.getElementById('feedback'),
  submitBtn: document.getElementById('submitBtn'),
  nextBtn: document.getElementById('nextBtn'),
  quitBtn: document.getElementById('quitBtn'),

  resultSummary: document.getElementById('resultSummary'),
  wrongList: document.getElementById('wrongList'),
  againBtn: document.getElementById('againBtn'),
  backBtn: document.getElementById('backBtn'),
};

const LS_KEY = 'kanji_wrong_counts_v1';

function loadWrongCounts(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}
function saveWrongCounts(obj){
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}
function incWrong(kanji){
  const obj = loadWrongCounts();
  obj[kanji] = (obj[kanji] || 0) + 1;
  saveWrongCounts(obj);
}
function resetWrong(){
  localStorage.removeItem(LS_KEY);
}

function randInt(n){ return Math.floor(Math.random() * n); }
function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

// Weighted sample without replacement
function weightedSample(items, weights, k){
  const picked = [];
  const pool = items.map((it, idx) => ({it, w: weights[idx]}));
  for (let t=0; t<k && pool.length>0; t++){
    const sum = pool.reduce((s,x)=>s+x.w,0);
    let r = Math.random()*sum;
    let i = 0;
    for (; i<pool.length; i++){
      r -= pool[i].w;
      if (r <= 0) break;
    }
    const chosen = pool.splice(Math.min(i, pool.length-1), 1)[0].it;
    picked.push(chosen);
  }
  return picked;
}

let DB = [];
let state = null;

async function init(){
  const res = await fetch('questions.json');
  DB = await res.json();

  updateTopbarIdle();

  els.startBtn.addEventListener('click', startSet);
  els.resetBtn.addEventListener('click', () => {
    resetWrong();
    alert('復習履歴をリセットしました。');
    updateTopbarIdle();
  });

  els.submitBtn.addEventListener('click', submitAnswer);
  els.nextBtn.addEventListener('click', nextQuestion);
  els.quitBtn.addEventListener('click', showResults);

  els.againBtn.addEventListener('click', () => {
    showStart(false);
    startSet();
  });
  els.backBtn.addEventListener('click', () => showStart(true));

  showStart(true);
}

function updateTopbarIdle(){
  const wrong = loadWrongCounts();
  const n = Object.keys(wrong).length;
  els.setInfo.textContent = '準備OK';
  els.scoreInfo.textContent = `復習 ${n}字`;
}

function showStart(resetUI){
  els.startCard.classList.remove('hidden');
  els.quizCard.classList.add('hidden');
  els.resultCard.classList.add('hidden');
  if (resetUI) updateTopbarIdle();
}

function startSet(){
  const total = parseInt(els.qCount.value, 10);
  const writeRatio = parseFloat(els.writeRatio.value);

  const wrongCounts = loadWrongCounts();
  const weights = DB.map(x => 1 + (wrongCounts[x.kanji] || 0) * 2); // 間違いが多いほど出やすい

  // まずは出題対象を total ぶん選ぶ（重み付き）
  const picked = weightedSample(DB, weights, total);

  // 読み/書きのタイプ割り当て
  const writeCount = Math.round(total * writeRatio);
  const types = shuffle(Array.from({length: total}, (_,i) => (i < writeCount ? 'write' : 'read')));

  state = {
    total,
    idx: 0,
    score: 0,
    wrongSet: new Set(),
    questions: picked.map((item, i) => ({ item, type: types[i] })),
    current: null,
    selected: null,
    locked: false,
  };

  els.startCard.classList.add('hidden');
  els.resultCard.classList.add('hidden');
  els.quizCard.classList.remove('hidden');

  renderQuestion();
}

function renderQuestion(){
  const q = state.questions[state.idx];
  state.current = q;
  state.selected = null;
  state.locked = false;

  els.feedback.classList.add('hidden');
  els.feedback.textContent = '';
  els.feedback.classList.remove('ok','ng');
  els.nextBtn.classList.add('hidden');
  els.submitBtn.classList.remove('hidden');

  els.qNum.textContent = `${state.idx + 1} / ${state.total}`;

  // Topbar
  els.setInfo.textContent = `セット：${state.total}問`;
  els.scoreInfo.textContent = `正解：${state.score}`;

  if (q.type === 'read'){
    els.qType.textContent = '読み（4択）';
    els.prompt.textContent = q.item.example_read;

    // choices
    els.choices.innerHTML = '';
    els.choices.classList.remove('hidden');
    els.writeArea.classList.add('hidden');

    const correct = normalizeYomi(q.item.yomi[0]);
    const distractors = makeYomiDistractors(correct, q.item.kanji, 3);
    const options = shuffle([correct, ...distractors]);

    options.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'choice';
      div.textContent = opt;
      div.addEventListener('click', () => {
        if (state.locked) return;
        [...els.choices.children].forEach(c => c.classList.remove('selected'));
        div.classList.add('selected');
        state.selected = opt;
      });
      els.choices.appendChild(div);
    });

  } else {
    els.qType.textContent = '書き（入力）';
    // 書き：hint を優先、なければ yomi[0] を使う
    const y = q.item.hint || normalizeYomi(q.item.yomi[0]);
    els.prompt.textContent = `よみ：${y}\n文：${q.item.example_write}`;

    els.choices.classList.add('hidden');
    els.writeArea.classList.remove('hidden');
    els.writeInput.value = '';
    els.writeInput.focus();
    els.writeHint.textContent = '※（　）に入る漢字を1字で入力してね';
  }
}

function normalizeYomi(s){
  // 「まよ(う)」のような表記を「まよう」に寄せる
  return (s || '').replace(/[()]/g,'').replace('　','').trim();
}

function makeYomiDistractors(correct, sameKanji, n){
  // DB全体から別の読みを集める（同じ漢字は避ける）
  const pool = [];
  for (const item of DB){
    if (item.kanji === sameKanji) continue;
    for (const y of item.yomi){
      const ny = normalizeYomi(y);
      if (ny && ny !== correct) pool.push(ny);
    }
  }
  const uniq = Array.from(new Set(pool));
  return shuffle(uniq).slice(0, n);
}

function submitAnswer(){
  if (state.locked) return;

  const q = state.current;
  let ok = false;
  let user = '';

  if (q.type === 'read'){
    user = state.selected || '';
    if (!user){
      alert('選択肢を選んでください。');
      return;
    }
    const correct = normalizeYomi(q.item.yomi[0]);
    ok = (user === correct);
  } else {
    user = (els.writeInput.value || '').trim();
    if (!user){
      alert('漢字を入力してください。');
      return;
    }
    ok = (user === q.item.kanji);
  }

  state.locked = true;

  if (ok){
    state.score += 1;
    showFeedback(true, q, user);
  } else {
    state.wrongSet.add(q.item.kanji);
    incWrong(q.item.kanji);
    showFeedback(false, q, user);
  }

  els.scoreInfo.textContent = `正解：${state.score}`;
  els.submitBtn.classList.add('hidden');
  els.nextBtn.classList.remove('hidden');
}

function showFeedback(isOk, q, user){
  els.feedback.classList.remove('hidden');
  els.feedback.classList.add(isOk ? 'ok' : 'ng');

  if (q.type === 'read'){
    const correct = normalizeYomi(q.item.yomi[0]);
    if (isOk){
      els.feedback.textContent = `◯ 正解！「${q.item.kanji}」の読みは「${correct}」。`;
    } else {
      els.feedback.textContent = `× ちがいます。正解は「${correct}」。`;
    }
  } else {
    if (isOk){
      els.feedback.textContent = `◯ 正解！「${q.item.hint}」＝「${q.item.kanji}」。`;
    } else {
      els.feedback.textContent = `× ちがいます。正解は「${q.item.kanji}」。`;
    }
  }
}

function nextQuestion(){
  if (!state) return;
  state.idx += 1;
  if (state.idx >= state.total){
    showResults();
    return;
  }
  renderQuestion();
}

function showResults(){
  els.quizCard.classList.add('hidden');
  els.resultCard.classList.remove('hidden');

  const total = state.total;
  const score = state.score;
  const wrongArr = Array.from(state.wrongSet);

  els.resultSummary.textContent = `${total}問中 ${score}問 正解。`;

  els.wrongList.innerHTML = '';
  if (wrongArr.length === 0){
    els.wrongList.textContent = 'なし（すごい！）';
  } else {
    wrongArr.forEach(k => {
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = k;
      els.wrongList.appendChild(span);
    });
  }

  els.setInfo.textContent = '結果';
  els.scoreInfo.textContent = `正解：${score}/${total}`;
}

init();
