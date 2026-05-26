import { useMemo, useState } from 'react';

type SequencePayload = {
  id: string;
  desc: string;
  seq: string;
};

type CellState = 'found' | 'miss' | 'hint' | 'idle';

const fallback =
  'ATGGCTTCAACCGGATCTCAAACTGGTTCAGGTAACTCATGCTTCACTGATGGAATCAAGTCACTGTCAAGTCC';

const region = '1:2300000..2300400:1';

async function fetchEnsemblSequence(species: string, targetRegion: string): Promise<SequencePayload> {
  const endpoint = `https://rest.ensembl.org/sequence/region/${species}/${targetRegion}?content-type=application/json`;
  const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<SequencePayload>;
}

function findTcaPositions(seq: string): number[] {
  const pos: number[] = [];
  for (let i = 0; i < seq.length - 2; i += 1) {
    if (seq.slice(i, i + 3) === 'TCA') pos.push(i);
  }
  return pos;
}

function getCellState(index: number, hits: number[], misses: number[], activeHint: number | null): CellState {
  if (hits.some((hit) => index >= hit && index < hit + 3)) return 'found';
  if (misses.includes(index)) return 'miss';
  if (activeHint !== null && index >= activeHint && index < activeHint + 3) return 'hint';
  return 'idle';
}

export function App() {
  const [sequence, setSequence] = useState(fallback);
  const [source, setSource] = useState('Training sequence');
  const [message, setMessage] = useState('TCA の先頭マスをクリックしてコンボを見つけろ');
  const [hits, setHits] = useState<number[]>([]);
  const [misses, setMisses] = useState<number[]>([]);
  const [activeHint, setActiveHint] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const allPositions = useMemo(() => findTcaPositions(sequence), [sequence]);
  const remaining = allPositions.length - hits.length;
  const score = Math.max(0, hits.length * 120 - misses.length * 15);
  const progress = allPositions.length === 0 ? 0 : Math.round((hits.length / allPositions.length) * 100);

  const resetRound = (nextSequence = sequence, nextSource = source) => {
    setSequence(nextSequence);
    setSource(nextSource);
    setHits([]);
    setMisses([]);
    setActiveHint(null);
    setMessage('TCA の先頭マスをクリックしてコンボを見つけろ');
  };

  const loadRealistic = async () => {
    try {
      setIsLoading(true);
      setMessage('Ensembl から実データをロード中...');
      const data = await fetchEnsemblSequence('human', region);
      const cleaned = data.seq.toUpperCase().replace(/[^ACGT]/g, '');
      resetRound(cleaned.length > 0 ? cleaned : fallback, `Ensembl human ${data.id}`);
      setMessage(`実データ投入: ${data.id} / ${cleaned.length} 塩基`);
    } catch {
      resetRound(fallback, 'Training sequence');
      setMessage('API取得失敗。トレーニング配列で続行中');
    } finally {
      setIsLoading(false);
    }
  };

  const revealHint = () => {
    const next = allPositions.find((pos) => !hits.includes(pos));
    if (next === undefined) {
      setMessage('全部発見済み。新しいラウンドへ進めます');
      return;
    }
    setActiveHint(next);
    setMessage(`ヒント発動: ${next} 付近を見ろ`);
  };

  const choosePosition = (index: number) => {
    setActiveHint(null);
    if (allPositions.includes(index)) {
      if (hits.includes(index)) {
        setMessage(`${index} は発見済み`);
        return;
      }
      const nextHits = [...hits, index].sort((a, b) => a - b);
      setHits(nextHits);
      setMessage(nextHits.length === allPositions.length ? 'CLEAR! 全 TCA を捕捉' : `HIT! ${index} から TCA。残り ${allPositions.length - nextHits.length}`);
      return;
    }
    if (!misses.includes(index)) setMisses((prev) => [...prev, index]);
    setMessage(`${index} は違う。3文字の並びを読め`);
  };

  return (
    <main className="game-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">DNA pattern hunt</p>
          <h1>TCA Sequence Game</h1>
          <p className="lead">塩基グリッドから TCA の開始位置をクリックして、ヒットを全回収するミニゲーム。</p>
        </div>
        <div className="score-panel" aria-label="score board">
          <span>score</span>
          <strong>{score}</strong>
        </div>
      </section>

      <section className="hud" aria-label="game status">
        <div>
          <span>found</span>
          <strong>{hits.length}/{allPositions.length}</strong>
        </div>
        <div>
          <span>miss</span>
          <strong>{misses.length}</strong>
        </div>
        <div>
          <span>remain</span>
          <strong>{remaining}</strong>
        </div>
        <div>
          <span>source</span>
          <strong>{source}</strong>
        </div>
      </section>

      <section className="command-bar">
        <button onClick={loadRealistic} disabled={isLoading}>
          {isLoading ? 'Loading...' : '実データで開始'}
        </button>
        <button className="secondary" onClick={() => resetRound()}>
          リセット
        </button>
        <button className="secondary" onClick={revealHint}>
          ヒント
        </button>
      </section>

      <section className="arena" aria-label="sequence arena">
        <div className="arena-top">
          <div>
            <p className="message">{message}</p>
            <div className="progress-track" aria-label={`progress ${progress}%`}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <code>{region}</code>
        </div>

        <div className="sequence-grid">
          {sequence.split('').map((base, index) => {
            const state = getCellState(index, hits, misses, activeHint);
            return (
              <button
                className={`base-cell ${state}`}
                key={`${base}-${index}`}
                onClick={() => choosePosition(index)}
                aria-label={`${index}: ${base}`}
              >
                <span>{base}</span>
                <small>{index}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="answer-strip" aria-label="found positions">
        <span>captured starts</span>
        <strong>{hits.length > 0 ? hits.join(' / ') : 'none'}</strong>
      </section>
    </main>
  );
}
