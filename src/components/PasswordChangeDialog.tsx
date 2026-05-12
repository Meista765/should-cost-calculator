import { useState, type FormEvent } from 'react';
import {
  checkPasswordStrength,
  decryptBundle,
  rotatePassword,
  type EncryptedBundleV2,
  type WrapperRole,
} from '../lib/crypto';
import { saveBundle } from '../lib/tauriFs';
import {
  BundleConflictError,
  computeEtag,
  getStoredAdminKey,
  isRemoteConfigured,
  pushRemoteBundle,
  setStoredAdminKey,
} from '../lib/remoteBundle';

type Props = {
  bundle: EncryptedBundleV2;
  etag: string | null;
  dek: CryptoKey;
  role: WrapperRole;
  onClose: () => void;
  onChanged: (nextBundle: EncryptedBundleV2, nextEtag: string | null) => void;
};

export function PasswordChangeDialog({ bundle, etag, dek, role, onClose, onChanged }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targetRoleLabel = role === 'admin' ? '관리자' : '사용자';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (next !== confirm) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    const strength = checkPasswordStrength(next);
    if (!strength.ok) {
      setError('비밀번호 강도 부족: ' + strength.reasons.join(', '));
      return;
    }
    if (next === current) {
      setError('새 비밀번호가 현재 비밀번호와 동일합니다.');
      return;
    }

    setBusy(true);
    try {
      // 1) 현재 pw 재확인 — 자기 role wrapper로 복호화 시도.
      const r = await decryptBundle(bundle, current);
      if (r.role !== role) {
        throw new Error(`이 비밀번호는 ${role} 권한이 아닙니다.`);
      }
      // 2) 다른 wrapper 가 새 pw로 unwrap되면 충돌 → 거부.
      try {
        const other = await decryptBundle(bundle, next);
        if (other.role !== role) {
          throw new Error(`새 비밀번호가 다른 권한(${other.role}) 비밀번호와 충돌합니다.`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('충돌')) throw err;
        // 충돌 외의 에러(=다른 wrapper도 풀리지 않음)는 정상 — 진행.
      }
      // 3) 회전 + 저장 (원격 우선, 그 후 로컬 캐시).
      const nextBundle = await rotatePassword(bundle, dek, role, next);
      if (isRemoteConfigured()) {
        let adminKey = getStoredAdminKey();
        if (!adminKey) {
          adminKey = window.prompt('관리자 API 키를 입력하세요 (1회만, 이후 자동 저장)') ?? '';
          if (!adminKey) throw new Error('관리자 API 키가 필요합니다.');
          setStoredAdminKey(adminKey);
        }
        if (etag === null) throw new Error('현재 원격 버전을 알 수 없어 저장할 수 없습니다. 새로고침 후 다시 시도하세요.');
        try {
          const result = await pushRemoteBundle(nextBundle, etag, adminKey, `pw-rotate:${role}`);
          await saveBundle(nextBundle);
          onChanged(nextBundle, result.etag);
        } catch (err) {
          if (err instanceof BundleConflictError) {
            throw new Error('다른 관리자가 먼저 저장했습니다. 잠금 해제부터 다시 시도하세요.');
          }
          if (err instanceof Error && err.message.includes('관리자 키')) {
            setStoredAdminKey(null);
          }
          throw err;
        }
      } else {
        await saveBundle(nextBundle);
        onChanged(nextBundle, await computeEtag(nextBundle));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dialog-card" aria-label="비밀번호 변경">
      <div className="section-heading">
        <h2>{targetRoleLabel} 비밀번호 변경</h2>
        <button type="button" onClick={onClose}>닫기</button>
      </div>
      <form onSubmit={submit} className="pw-change-form">
        <label className="field">
          <span className="field-label">현재 비밀번호</span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            spellCheck={false}
            disabled={busy}
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">새 비밀번호 (16자 이상, 4종 포함)</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <label className="field">
          <span className="field-label">새 비밀번호 (확인)</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            disabled={busy}
          />
        </label>
        <div className="dialog-actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? '변경 중…' : '비밀번호 변경'}
          </button>
        </div>
        {error && <p className="error" role="alert">⚠ {error}</p>}
      </form>
    </section>
  );
}
