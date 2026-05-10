import { useState } from 'react';
import { buildDb, detectKind, type DataKind } from '../lib/parseMarkdown';
import type { Db } from '../types/domain';

type Props = { onLoaded: (db: Db) => void };

const KIND_LABEL: Record<DataKind, string> = {
  coil: '원코일/스크랩 가격',
  gravity: '강종 비중',
  press: '설비임율(프레스)',
  worker: '노무임율(직종)',
};

export function DataImport({ onLoaded }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [recognized, setRecognized] = useState<Record<DataKind, string | null>>({
    coil: null,
    gravity: null,
    press: null,
    worker: null,
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    try {
      const parts: Partial<Record<DataKind, string>> = {};
      const labels: Record<DataKind, string | null> = {
        coil: null,
        gravity: null,
        press: null,
        worker: null,
      };
      for (const file of Array.from(files)) {
        const text = await file.text();
        const kind = detectKind(text);
        if (!kind) throw new Error(`인식할 수 없는 파일 형식: ${file.name}`);
        if (parts[kind]) throw new Error(`${KIND_LABEL[kind]} 데이터가 중복: ${file.name}`);
        parts[kind] = text;
        labels[kind] = file.name;
      }
      setRecognized(labels);
      const db = buildDb(parts);
      onLoaded(db);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }

  return (
    <section className="form-card import-card">
      <h2>대외비 데이터 가져오기</h2>
      <p className="muted">
        원본 마크다운 파일 4개(원코일 가격, 비중, 설비임율, 노무임율)를 한 번에 선택해 주세요.
        파일 종류는 헤더로 자동 인식됩니다. 가져온 데이터는 <strong>이 브라우저에만</strong>{' '}
        저장되며 외부 서버로 전송되지 않습니다.
      </p>

      <input
        type="file"
        accept=".md,text/markdown,text/plain"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />

      <table className="import-table">
        <thead>
          <tr>
            <th>종류</th>
            <th>인식된 파일</th>
          </tr>
        </thead>
        <tbody>
          {(Object.keys(KIND_LABEL) as DataKind[]).map((k) => (
            <tr key={k}>
              <td>{KIND_LABEL[k]}</td>
              <td>{recognized[k] ?? <span className="muted">미선택</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {error && <p className="error">⚠ {error}</p>}

      <p className="footnote muted">
        * 다음 방문에도 같은 브라우저라면 다시 가져올 필요가 없습니다(localStorage 보관).
      </p>
    </section>
  );
}
