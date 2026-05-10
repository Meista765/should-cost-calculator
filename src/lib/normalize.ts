// 강종명 정규화 및 비중 fallback 매핑.
export function canonicalGrade(s: string): string {
  return s.replace(/[\s()]/g, '');
}

// 비중표에는 없지만 가격표에는 있는 강종을 위한 fallback (계열 비중 사용).
// 결과에 "비중 추정값" 경고를 함께 표시한다.
export const GRAVITY_FALLBACK: Record<string, { grade: string; reason: string }> = {
  STS304J1: { grade: 'STS304', reason: 'STS304 계열로 비중 추정' },
};
