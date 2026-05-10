import { useState, type FormEvent } from 'react';
import { decryptDb, type EncryptedBundle } from '../lib/crypto';
import type { Db } from '../types/domain';

type Props = {
  bundle: EncryptedBundle;
  onUnlocked: (db: Db) => void;
};

export function PasswordPrompt({ bundle, onUnlocked }: Props) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (pw.length === 0) {
      setError('비밀번호를 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      const db = await decryptDb(bundle, pw);
      // 비밀번호는 어디에도 보관하지 않는다. 사용 직후 메모리에서 폐기.
      setPw('');
      onUnlocked(db);
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
        <label htmlFor="unlock-password" className="sr-only">
          비밀번호
        </label>
        <input
          id="unlock-password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호"
          autoFocus
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="unlock-pw-help"
        />
        <button type="submit" className="primary" disabled={busy || pw.length === 0}>
          {busy ? '복호화 중…' : '잠금 해제'}
        </button>
      </form>
      {error && <p className="error" role="alert">⚠ {error}</p>}
      <p id="unlock-pw-help" className="footnote muted">
        데이터 갱신 시각: {encryptedAt}
        <br />
        보안 강화를 위해 비밀번호는 캐시되지 않습니다. 새로고침/탭 전환 시 다시 입력해야 합니다.
      </p>
    </section>
  );
}
