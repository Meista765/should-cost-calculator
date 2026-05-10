import { useState, type FormEvent } from 'react';
import { decryptDb, type EncryptedBundle } from '../lib/crypto';
import type { Db } from '../types/domain';

type Props = {
  bundle: EncryptedBundle;
  onUnlocked: (db: Db, password: string) => void;
};

export function PasswordPrompt({ bundle, onUnlocked }: Props) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const db = await decryptDb(bundle, pw);
      onUnlocked(db, pw);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const encryptedAt = new Date(bundle.encryptedAt).toLocaleString('ko-KR');

  return (
    <section className="form-card import-card">
      <h2>잠금 해제</h2>
      <p className="muted">
        사내에서 공유받은 비밀번호를 입력하세요. 입력값은 외부 서버로 전송되지 않으며,
        브라우저 내부에서 WebCrypto API로 복호화됩니다.
      </p>
      <form onSubmit={submit} className="pw-form">
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호"
          autoFocus
          disabled={busy}
        />
        <button type="submit" className="primary" disabled={busy || pw.length === 0}>
          {busy ? '복호화 중…' : '잠금 해제'}
        </button>
      </form>
      {error && <p className="error">⚠ {error}</p>}
      <p className="footnote muted">
        데이터 갱신 시각: {encryptedAt}
        <br />
        같은 탭이 열려 있는 동안에는 자동 잠금 해제 상태로 유지됩니다(sessionStorage).
      </p>
    </section>
  );
}
