// 강종명 정규화 — 공백/괄호 제거 후 비교용 키 생성.
export function canonicalGrade(s: string): string {
  return s.replace(/[\s()]/g, '');
}
