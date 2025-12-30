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

const LS_KEY = 'kanji_wrong_counts_v2';

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

function normalizeYomi(s){
  // 「まよ(う)」のような表記を「まよう」に寄せる
  return (s || '').replace(/[()]/g,'').replace(/　/g,'').trim();
}
function primaryYomi(item){
  // 書き問題に出す読み：hint があれば優先、なければ yomi[0]
  return normalizeYomi(item.hint || item.yomi?.[0] || '');
}

function clearChoiceUI(){
  els.choices.innerHTML = '';
  // 選択状態を消す
  state.selected = null;
}

function renderChoices(options){
  clearChoiceUI();
  els.choices.classList.remove('hidden');
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

function makeKanjiDistractorsBySimilarYomi(correctItem, n){
  // 「似たような読み」優先：同じ先頭1文字（かな）で候補を集める。
  // 足りなければDBからランダム補完。
  const correctY = primaryYomi(correctItem);
  const key = (correctY || '')[0] || '';
  const pool1 = [];
  const pool2 = [];

  for (const item of DB){
    if (item.kanji === correctItem.kanji) continue;
    const y0 = primaryYomi(item);
    if (!y0) continue;
    if (key && y0[0] === key) pool1.push(item.kanji);
    else pool2.push(item.kanji);
  }

  const uniq1 = Array.from(new Set(pool1));
  const uniq2 = Array.from(new Set(pool2));

  const pick1 = shuffle(uniq1).slice(0, n);
  if (pick1.length >= n) return pick1;

  const remaining = n - pick1.length;
  const pick2 = shuffle(uniq2).slice(0, remaining);
  return pick1.concat(pick2);
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

  // 入力欄は今回使わない（4択に統一）
  els.writeArea.classList.add('hidden');

  if (q.type === 'read'){
    els.qType.textContent = '読み（4択）';
    els.prompt.textContent = q.item.example_read;

    const correct = normalizeYomi(q.item.yomi[0]);
    const distractors = makeYomiDistractors(correct, q.item.kanji, 3);
    const options = shuffle([correct, ...distractors]);
    renderChoices(options);

  } else {
    els.qType.textContent = '書き（4択）';
    const y = primaryYomi(q.item);
    // 改行を見やすくするため、
 を <br> にしたいが、textContentで安全優先にする
    els.prompt.textContent = `よみ：${y}　／　文：${q.item.example_write}`;

    const distractors = makeKanjiDistractorsBySimilarYomi(q.item, 3);
    const options = shuffle([q.item.kanji, ...distractors]);
    renderChoices(options);
  }
}

function submitAnswer(){
  if (state.locked) return;

  const q = state.current;
  const user = state.selected || '';
  if (!user){
    alert('選択肢を選んでください。');
    return;
  }

  let ok = false;
  if (q.type === 'read'){
    const correct = normalizeYomi(q.item.yomi[0]);
    ok = (user === correct);
  } else {
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

function showFeedback(isOk, q){
  els.feedback.classList.remove('hidden');
  els.feedback.classList.add(isOk ? 'ok' : 'ng');

  if (q.type === 'read'){
    const correct = normalizeYomi(q.item.yomi[0]);
    els.feedback.textContent = isOk
      ? `◯ 正解！「${q.item.kanji}」の読みは「${correct}」。`
      : `× ちがいます。正解は「${correct}」。`;
  } else {
    const y = primaryYomi(q.item);
    els.feedback.textContent = isOk
      ? `◯ 正解！「${y}」＝「${q.item.kanji}」。`
      : `× ちがいます。正解は「${q.item.kanji}」（よみ：${y}）。`;
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
