import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SequencePayload = { id: string; desc: string; seq: string };
type CellState = 'found' | 'miss' | 'hint' | 'idle';
type GameStatus = 'playing' | 'cleared' | 'failed';
type DifficultyKey = 'starter' | 'standard' | 'expert';
type SoundEffect = 'tap' | 'hit' | 'miss' | 'hint' | 'clear' | 'gameover';

const difficulties = {
  starter: { label: 'Starter', length: 96, lives: 6, points: 100, description: '短い配列で練習' },
  standard: { label: 'Standard', length: 160, lives: 5, points: 140, description: 'ほどよい探索量' },
  expert: { label: 'Expert', length: 240, lives: 4, points: 200, description: '長い配列に挑戦' },
} satisfies Record<DifficultyKey, { label: string; length: number; lives: number; points: number; description: string }>;

const humanChr1Length = 248_956_422;
const baseLabels: Record<string, string> = { A: 'Adenine', C: 'Cytosine', G: 'Guanine', T: 'Thymine' };

function createRandomRegion(length: number): string {
  const start = Math.floor(Math.random() * (humanChr1Length - length)) + 1;
  return `1:${start}..${start + length - 1}:1`;
}

function createTrainingSequence(length: number): string {
  const bases = ['A', 'C', 'G', 'T'];
  const sequence = Array.from({ length }, () => bases[Math.floor(Math.random() * bases.length)]);
  const anchors = [Math.floor(length * 0.16), Math.floor(length * 0.51), Math.floor(length * 0.82)];
  anchors.forEach((anchor) => sequence.splice(anchor, 3, 'T', 'C', 'A'));
  return sequence.join('');
}

async function fetchEnsemblSequence(targetRegion: string): Promise<SequencePayload> {
  const endpoint = `https://rest.ensembl.org/sequence/region/human/${targetRegion}?content-type=application/json`;
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Ensembl API error: ${response.status}`);
  return response.json() as Promise<SequencePayload>;
}

function findTcaPositions(sequence: string): number[] {
  const positions: number[] = [];
  for (let index = 0; index <= sequence.length - 3; index += 1) {
    if (sequence.slice(index, index + 3) === 'TCA') positions.push(index);
  }
  return positions;
}

function getCellState(index: number, hits: number[], misses: number[], hint: number | null): CellState {
  if (hits.some((hit) => index >= hit && index < hit + 3)) return 'found';
  if (misses.includes(index)) return 'miss';
  if (hint !== null && index >= hint && index < hint + 3) return 'hint';
  return 'idle';
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function playTone(context: AudioContext, frequency: number, startsIn: number, duration: number, type: OscillatorType, volume: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + startsIn;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.015, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function synthesizeEffect(context: AudioContext, effect: SoundEffect, intensity = 1) {
  const recipes: Record<SoundEffect, Array<[number, number, number, OscillatorType, number]>> = {
    tap: [[220, 0, 0.045, 'sine', 0.035]],
    hint: [[740, 0, 0.08, 'sine', 0.045], [988, 0.07, 0.13, 'sine', 0.04]],
    hit: [[523, 0, 0.09, 'triangle', 0.07], [659, 0.055, 0.11, 'sine', 0.065], [784, 0.11, 0.16, 'sine', 0.055]],
    miss: [[145, 0, 0.16, 'sawtooth', 0.045], [92, 0.045, 0.22, 'square', 0.025]],
    clear: [[523, 0, 0.12, 'triangle', 0.07], [659, 0.08, 0.12, 'triangle', 0.07], [784, 0.16, 0.14, 'triangle', 0.07], [1047, 0.25, 0.32, 'sine', 0.08], [1319, 0.31, 0.3, 'sine', 0.045]],
    gameover: [[196, 0, 0.18, 'triangle', 0.055], [147, 0.14, 0.2, 'triangle', 0.05], [98, 0.29, 0.34, 'sawtooth', 0.025]],
  };
  recipes[effect].forEach(([frequency, start, duration, type, volume]) => {
    const comboPitch = effect === 'hit' ? Math.min(1.5, 1 + (intensity - 1) * 0.08) : 1;
    playTone(context, frequency * comboPitch, start, duration, type, volume);
  });
}

function Icon({ name }: { name: 'dna' | 'spark' | 'refresh' | 'hint' | 'upload' | 'heart' | 'sound' | 'mute' }) {
  const paths = {
    dna: <><path d="M7 3c0 7 10 7 10 18M17 3c0 7-10 7-10 18"/><path d="M8.5 6h7M7.5 10h9M7.5 14h9M8.5 18h7"/></>,
    spark: <path d="m12 3 1.2 4.2L17 9l-3.8 1.8L12 15l-1.2-4.2L7 9l3.8-1.8L12 3Zm6 11 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z"/>,
    refresh: <><path d="M20 7v5h-5"/><path d="M18.5 16a8 8 0 1 1-.4-8.4L20 12"/></>,
    hint: <><path d="M9 18h6M10 22h4"/><path d="M8.1 14.5A7 7 0 1 1 16 14c-1.2.9-1 2-1 2H9s.2-1.1-.9-1.5Z"/></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 15v5h14v-5"/></>,
    heart: <path d="M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>,
    sound: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/></>,
    mute: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 10 5 5m0-5-5 5"/></>,
  };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function App() {
  const [difficulty, setDifficulty] = useState<DifficultyKey>('standard');
  const config = difficulties[difficulty];
  const initialSequence = useRef(createTrainingSequence(config.length));
  const [sequence, setSequence] = useState(initialSequence.current);
  const [region, setRegion] = useState('Practice dataset');
  const [source, setSource] = useState('TRAINING');
  const [message, setMessage] = useState('TCA の先頭を探してクリックしよう');
  const [hits, setHits] = useState<number[]>([]);
  const [misses, setMisses] = useState<number[]>([]);
  const [activeHint, setActiveHint] = useState<number | null>(null);
  const [lives, setLives] = useState(config.lives);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [isLoading, setIsLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState('');
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('tca-best-score') ?? 0));
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('tca-sound') !== 'off');
  const audioContext = useRef<AudioContext | null>(null);

  const allPositions = useMemo(() => findTcaPositions(sequence), [sequence]);
  const remaining = allPositions.length - hits.length;
  const progress = allPositions.length === 0 ? 0 : Math.round((hits.length / allPositions.length) * 100);

  const playSound = useCallback((effect: SoundEffect, intensity = 1) => {
    if (!soundEnabled) return;
    const context = audioContext.current ?? new AudioContext();
    audioContext.current = context;
    if (context.state === 'suspended') void context.resume();
    synthesizeEffect(context, effect, intensity);
  }, [soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('tca-sound', next ? 'on' : 'off');
    if (next) {
      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      if (context.state === 'suspended') void context.resume();
      synthesizeEffect(context, 'hint');
    }
  };

  useEffect(() => {
    if (status !== 'playing') return undefined;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [status, sequence]);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem('tca-best-score', String(score));
    }
  }, [bestScore, score]);

  const startRound = useCallback((nextSequence: string, nextSource = 'TRAINING', nextRegion = 'Practice dataset', nextDifficulty = difficulty) => {
    const nextConfig = difficulties[nextDifficulty];
    setSequence(nextSequence);
    setSource(nextSource);
    setRegion(nextRegion);
    setHits([]);
    setMisses([]);
    setActiveHint(null);
    setLives(nextConfig.lives);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setElapsed(0);
    setStatus('playing');
    setMessage('TCA の先頭を探してクリックしよう');
  }, [difficulty]);

  const startTraining = useCallback((nextDifficulty = difficulty) => {
    const nextConfig = difficulties[nextDifficulty];
    startRound(createTrainingSequence(nextConfig.length), 'TRAINING', 'Practice dataset', nextDifficulty);
  }, [difficulty, startRound]);

  const selectDifficulty = (nextDifficulty: DifficultyKey) => {
    playSound('tap');
    setDifficulty(nextDifficulty);
    startTraining(nextDifficulty);
  };

  const loadRealSequence = async () => {
    try {
      setIsLoading(true);
      setMessage('Ensembl からヒトゲノムを読み込み中…');
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const nextRegion = createRandomRegion(config.length);
        const data = await fetchEnsemblSequence(nextRegion);
        const cleaned = data.seq.toUpperCase().replace(/[^ACGT]/g, '');
        if (cleaned.length && findTcaPositions(cleaned).length) {
          startRound(cleaned, 'ENSEMBL · HUMAN', nextRegion);
          setMessage(`実データをロードしました — chromosome ${nextRegion}`);
          return;
        }
      }
      throw new Error('No target motif found');
    } catch {
      startTraining();
      setMessage('通信に失敗したため、練習データに切り替えました');
    } finally {
      setIsLoading(false);
    }
  };

  const revealHint = useCallback(() => {
    if (status !== 'playing') return;
    const next = allPositions.find((position) => !hits.includes(position));
    if (next === undefined) return;
    playSound('hint');
    setActiveHint(next);
    setScore((value) => Math.max(0, value - 75));
    setStreak(0);
    setMessage(`ヒント：index ${next} 付近が反応しています`);
  }, [allPositions, hits, playSound, status]);

  const choosePosition = (index: number) => {
    if (status !== 'playing') return;
    setActiveHint(null);
    if (allPositions.includes(index)) {
      if (hits.includes(index)) {
        setMessage(`index ${index} は発見済みです`);
        return;
      }
      const nextHits = [...hits, index].sort((a, b) => a - b);
      const nextStreak = streak + 1;
      const earned = config.points + Math.max(0, nextStreak - 1) * 25;
      setHits(nextHits);
      setStreak(nextStreak);
      setBestStreak((value) => Math.max(value, nextStreak));
      setScore((value) => value + earned);
      if (nextHits.length === allPositions.length) {
        playSound('clear');
        setStatus('cleared');
        setMessage('解析完了 — すべての TCA を発見しました');
      } else {
        playSound('hit', nextStreak);
        setMessage(`HIT +${earned} — 残り ${allPositions.length - nextHits.length} ヵ所`);
      }
      return;
    }
    if (misses.includes(index)) {
      setMessage(`index ${index} は確認済みです`);
      return;
    }
    const nextLives = lives - 1;
    setMisses((current) => [...current, index]);
    setLives(nextLives);
    setStreak(0);
    setScore((value) => Math.max(0, value - 20));
    if (nextLives <= 0) {
      playSound('gameover');
      setStatus('failed');
      setMessage('解析失敗 — ライフを使い切りました');
    } else {
      playSound('miss');
      setMessage(`MISS — あと ${nextLives} 回。3 塩基の並びを確認しよう`);
    }
  };

  const submitCustomSequence = () => {
    const cleaned = customInput.toUpperCase().replace(/\s/g, '');
    if (!/^[ACGT]+$/.test(cleaned)) {
      setCustomError('A / C / G / T のみを入力してください');
      return;
    }
    if (cleaned.length < 12 || cleaned.length > 500) {
      setCustomError('12〜500 塩基の範囲で入力してください');
      return;
    }
    if (findTcaPositions(cleaned).length === 0) {
      setCustomError('TCA を1つ以上含む配列を入力してください');
      return;
    }
    setCustomError('');
    setShowCustom(false);
    startRound(cleaned, 'CUSTOM', `${cleaned.length} bp custom sequence`);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === 'h') revealHint();
      if (event.key.toLowerCase() === 'r') startTraining();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [revealHint, startTraining]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TCA Finder home">
          <span className="brand-mark"><Icon name="dna" /></span>
          <span><strong>TCA Finder</strong><small>Genome pattern lab</small></span>
        </a>
        <div className="topbar-meta">
          <button className="sound-toggle" onClick={toggleSound} aria-label={soundEnabled ? '効果音をミュート' : '効果音をオン'} aria-pressed={soundEnabled} title={soundEnabled ? 'Sound on' : 'Sound off'}><Icon name={soundEnabled ? 'sound' : 'mute'} /></button>
          <div className="best-score"><span>Personal best</span><strong>{bestScore.toLocaleString()}</strong></div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Sequence challenge · 01</p>
          <h1>Find the pattern.<br /><em>Read the code.</em></h1>
          <p className="lead">DNA 配列に隠れた <code>TCA</code> を見つける、短くて奥深いパターン探索ゲーム。</p>
        </div>
        <div className="target-card" aria-label="target pattern">
          <div className="target-card-head"><span>Target motif</span><span className="live-dot">LIVE</span></div>
          <div className="motif" aria-label="T C A"><span className="base-t">T</span><i>→</i><span className="base-c">C</span><i>→</i><span className="base-a">A</span></div>
          <p>先頭の <strong>T</strong> をクリック</p>
        </div>
      </section>

      <section className="control-deck" aria-label="game settings">
        <div className="difficulty-picker">
          <span className="control-label">Difficulty</span>
          <div className="segmented">
            {(Object.keys(difficulties) as DifficultyKey[]).map((key) => (
              <button className={difficulty === key ? 'active' : ''} key={key} onClick={() => selectDifficulty(key)}>
                {difficulties[key].label}<small>{difficulties[key].length} bp</small>
              </button>
            ))}
          </div>
        </div>
        <div className="actions">
          <button className="button ghost" onClick={() => setShowCustom((value) => !value)}><Icon name="upload" />配列を入力</button>
          <button className="button primary" onClick={loadRealSequence} disabled={isLoading}><Icon name="spark" />{isLoading ? 'Loading…' : '実ゲノムで開始'}</button>
        </div>
      </section>

      {showCustom && (
        <section className="custom-panel">
          <div><span className="control-label">Custom sequence</span><p>研究データや好きな配列を貼り付けてプレイできます。</p></div>
          <textarea value={customInput} onChange={(event) => setCustomInput(event.target.value)} placeholder="例: ATGCTCAACGT…" aria-label="custom DNA sequence" />
          <div className="custom-footer"><span className={customError ? 'error' : ''}>{customError || `${customInput.replace(/\s/g, '').length} / 500 bp`}</span><button className="button primary compact" onClick={submitCustomSequence}>この配列で開始</button></div>
        </section>
      )}

      <section className="game-board">
        <div className="game-toolbar">
          <div className="round-state"><span className={`status-orb ${status}`} /><div><span>{source}</span><strong>{region}</strong></div></div>
          <div className="toolbar-actions">
            <button onClick={revealHint} disabled={status !== 'playing'} title="ヒント (H)"><Icon name="hint" /><span>Hint</span><kbd>H</kbd></button>
            <button onClick={() => startTraining()} title="リセット (R)"><Icon name="refresh" /><span>Reset</span><kbd>R</kbd></button>
          </div>
        </div>

        <div className="stat-grid" aria-label="game status">
          <div className="stat score-stat"><span>Score</span><strong>{score.toLocaleString()}</strong><small>+{config.points} / hit</small></div>
          <div className="stat"><span>Progress</span><strong>{hits.length}<small> / {allPositions.length}</small></strong><div className="mini-progress"><i style={{ width: `${progress}%` }} /></div></div>
          <div className="stat"><span>Streak</span><strong>×{streak}</strong><small>best ×{bestStreak}</small></div>
          <div className="stat"><span>Time</span><strong>{formatTime(elapsed)}</strong><small>{sequence.length} base pairs</small></div>
          <div className="stat lives-stat"><span>Lives</span><div className="hearts" aria-label={`${lives} lives remaining`}>{Array.from({ length: config.lives }, (_, index) => <Icon key={index} name="heart" />).map((heart, index) => <span className={index >= lives ? 'lost' : ''} key={index}>{heart}</span>)}</div><small>{misses.length} misses</small></div>
        </div>

        <div className={`message-bar ${status}`} role="status"><span><Icon name={status === 'cleared' ? 'spark' : status === 'failed' ? 'refresh' : 'dna'} /></span><p>{message}</p><strong>{progress}%</strong></div>

        <div className="sequence-wrap">
          <div className="sequence-ruler"><span>5′</span><i /><span>3′</span></div>
          <div className="sequence-grid" aria-label="DNA sequence">
            {sequence.split('').map((base, index) => {
              const cellState = getCellState(index, hits, misses, activeHint);
              const isStart = hits.includes(index);
              return (
                <button
                  className={`base-cell base-${base.toLowerCase()} ${cellState} ${isStart ? 'motif-start' : ''}`}
                  key={`${base}-${index}`}
                  onClick={() => choosePosition(index)}
                  aria-label={`index ${index}, ${baseLabels[base]}, ${cellState}`}
                  disabled={status !== 'playing'}
                >
                  <span>{base}</span><small>{index}</small>{isStart && <b>TCA</b>}
                </button>
              );
            })}
          </div>
        </div>

        <footer className="board-footer">
          <div className="legend"><span><i className="legend-hit" />Found</span><span><i className="legend-hint" />Hint</span><span><i className="legend-miss" />Miss</span></div>
          <p>Found indices <strong>{hits.length ? hits.join(', ') : '—'}</strong></p>
        </footer>
      </section>

      {status !== 'playing' && (
        <section className={`result-card ${status}`} role="dialog" aria-modal="true" aria-label="round result">
          <div className="result-icon"><Icon name={status === 'cleared' ? 'spark' : 'refresh'} /></div>
          <p className="eyebrow">{status === 'cleared' ? 'Analysis complete' : 'Sequence lost'}</p>
          <h2>{status === 'cleared' ? 'Perfect scan.' : 'One more run?'}</h2>
          <p>{status === 'cleared' ? `${formatTime(elapsed)} で ${allPositions.length} 個のモチーフを捕捉しました。` : `答えは ${allPositions.length} ヵ所。ヒントを使って再挑戦できます。`}</p>
          <div className="result-stats"><span><small>Score</small><strong>{score.toLocaleString()}</strong></span><span><small>Best streak</small><strong>×{bestStreak}</strong></span><span><small>Accuracy</small><strong>{Math.round((hits.length / Math.max(1, hits.length + misses.length)) * 100)}%</strong></span></div>
          <div className="result-actions"><button className="button ghost" onClick={() => startTraining()}><Icon name="refresh" />練習で再挑戦</button><button className="button primary" onClick={loadRealSequence}><Icon name="spark" />次のゲノムへ</button></div>
        </section>
      )}

      <footer className="page-footer"><span>TCA Finder · Genome Pattern Lab</span><span>Data powered by <a href="https://rest.ensembl.org" target="_blank" rel="noreferrer">Ensembl REST API</a></span></footer>
    </main>
  );
}
