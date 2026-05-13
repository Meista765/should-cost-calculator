# Should-Cost Calculator

판금/프레스 3D 설계 변경에 따른 가격 AS-IS / TO-BE 계산기.
React + Vite + TypeScript SPA + **Tauri**로 패키징된 오프라인 .exe.

두 가지 모드 제공:
- **프레스 모드** — 기존 단발/프로 프레스 가공 모델 (코일·두께·UPH 기반)
- **판금 모드** — 엑셀 v10 산식 완전 이식 (레이저·절곡·NCT·세척·용접·도장·운반·관리비·이윤·should-cost)

## 기술 스택

- **프론트엔드**: React 18, TypeScript 5, Vite 5
- **데스크탑 패키징**: Tauri 2 (Rust + WebView2)
- **테스트**: Vitest

## 권한 / 비밀번호

이중 envelope 암호화로 단일 ciphertext를 두 비밀번호로 unwrap 가능:
- **관리자 비밀번호** — 단가 DB 편집, 비밀번호 변경, 재암호화 권한
- **사용자 비밀번호** — 계산기 사용(읽기 전용)

비밀번호는 어디에도 캐시되지 않는다. 잠금/탭 전환 시 DEK·DB 모두 메모리에서 폐기.

## 빌드 명령 (셸 무관 — npm 명령만 사용)

```bash
# 1. 의존성 설치
npm install

# 2. 데이터 .md → 암호화 번들 (관리자/사용자 비번 분리)
#    셸의 환경변수 문법 ($env:, export) 없이도 동작하는 세 가지 방법:

# 2-A. 대화형 입력 (권장 — 비번 마스킹, 명령 히스토리에 안 남음)
npm run encrypt:data

# 2-B. npm 인자로 직접 전달 (-- 뒤에 두 비번을 따옴표로)
npm run encrypt:data -- "AdminPwLong16+1A!" "UserPwLong16+1A!"

# 2-C. 환경변수 (CI / 자동화용)
#      PowerShell:  $env:BUILD_ADMIN_PASSWORD="..."; $env:BUILD_USER_PASSWORD="..."; npm run encrypt:data
#      bash      :  BUILD_ADMIN_PASSWORD=.. BUILD_USER_PASSWORD=.. npm run encrypt:data

# 3. 로컬 개발
npm run dev               # 브라우저
npm run tauri:dev         # Tauri 데스크탑 셸

# 4. 테스트
npm test

# 5. 운영 빌드
npm run build             # 웹 정적 빌드 (dist/)
npm run tauri:build       # .exe / MSI (src-tauri/target/release/bundle/)
```

비밀번호 강도 정책: **16자 이상 + 소문자/대문자/숫자/특수문자 모두 포함, 관리자≠사용자**.

## Tauri 빌드 요구사항

- **Rust 1.77+** (https://rustup.rs/)
- **MSVC build tools** (Windows 빌드 시)
- **WebView2 Evergreen Runtime** — Windows 10/11에 기본 탑재. 누락 PC는 빌드 시 `embedBootstrapper`로 자동 설치됨.
- 아이콘: `src-tauri/icons/`에 32x32/128x128 PNG 및 .ico/.icns. 기본 아이콘은 `npm run tauri icon path/to/icon.png`으로 생성.

## v1 → v2 마이그레이션 (기존 사용자만)

기존 단일 비번 v1 번들을 가지고 있다면:

```bash
$env:OLD_PW = "<기존 비번>"
$env:ADMIN_PW = "<새 관리자 비번>"
$env:USER_PW  = "<새 사용자 비번>"
node scripts/migrate-bundle.mjs
```

v10 sheet 데이터(레이저/절곡/NCT/…)는 v1에 없으므로 마이그레이션 후 관리자 모드에서 채우거나 `npm run encrypt:data`로 재빌드 권장.

## 사내 배포 절차

1. 로컬에서 `npm run tauri:build`
2. 결과물 `src-tauri/target/release/bundle/nsis/*.exe` (또는 `msi/*.msi`)를 사내 파일서버/Teams로 공유
3. 사용자는 .exe 더블클릭으로 설치 → 첫 실행 시 시드 ciphertext가 `%APPDATA%\com.meista765.should-cost-calculator\encrypted.json`에 복사됨
4. 사용자 비번 / 관리자 비번을 별도 채널로 공유

## 입력 항목

### 프레스 모드
- **원소재**: 폭(mm), 피치(mm), 두께(mm), 스크랩 회수율(%), 강종
- **제품**: 체적(mm³) 외 참고 치수
- **설비**: 공정 수(1~20), 톤수, UPH, 직종
- **공통**: 일반관리비율(%), 이윤율(%), 후공정 추가비용, 운반비 직접입력

### 판금 모드 (엑셀 v10)
- **재질·치수**: 재질·두께·X·Y·체적·배치수량·재료/스크랩 단가
- **레이저**: 외곽 둘레·피어싱 수
- **절곡**: bend 수
- **NCT**: 엠보싱·버링·탭·루버·탭사이즈
- **세척**: 적용 Y/N·조수
- **용접**: 종류(TIG/MIG/MAG/CO2/Robot/Spot)·길이·점수·자세계수
- **도장**: 적용 Y/N·면적·도막두께·도료가·시간
- **운반**: 방식(용달/자체)·차량톤수·거리·왕복·회당 적재
- **관리비·이윤**: % 오버라이드, 후공정 추가비용

## 계산식 (판금 모드 = 엑셀 v10)

```
재료비   = 원소재중량 × 재료단가 − 스크랩중량 × 스크랩단가
레이저   = (둘레 / 절단속도 + 피어싱수 × 피어싱시간 / 60) × 임율 / 60
절곡     = (셋업/배치 + bend수 × bend시간 / 60) × 임율 / 60
NCT      = (셋업/배치 + Σ형상시간/60) × 임율 / 60 (배치당)
세척     = 순중량 × 단가(조수·재질군)
용접     = (길이/속도 또는 점수×spot시간/60) × 자세계수 × 임율 / 60
도장     = (면적·도막·비중/효율) × 도료가/1000 + 시간 × (부스+소결로)/60
운반     = (방식별 운임 × 횟수) / 배치수량
직접비   = 재료 + 레이저 + 절곡 + 후공정 + 운반 + NCT + 세척 + 용접 + 도장
일반관리비 = 직접비 × 관리비율
이윤     = (직접비 + 일반관리비) × 이윤율
Should-Cost = 직접비 + 일반관리비 + 이윤
```

자세한 매트릭스/단가는 `Data/Sheet/*.md` 참조. v10 산식과의 일치성은 `src/lib/__tests__/calcSheet.test.ts`의 `SAMPLE-001`로 검증된다.

## 관리자 패널

관리자 비밀번호로 잠금 해제 후 헤더의 "관리자 패널" 버튼:
- 16개 DB 탭(코일가·비중·프레스·작업자·재질메타·절단속도·피어싱·절곡·NCT·용접속도·세척·운반(용달)·운반(자체)·공정요율·도장상수·기본가정)을 JSON 텍스트로 편집
- 저장 시 DEK는 유지하고 payload만 재암호화 → `%APPDATA%\…\encrypted.json` 원자적 덮어쓰기
- 일반 사용자는 다음 잠금 해제 시 변경된 값으로 계산

## 보안 모델

- 모든 단가는 ciphertext로만 디스크 보관 (Tauri/웹 공통)
- WebCrypto API: PBKDF2-SHA256(600,000회) → AES-GCM-256
- DEK 32 bytes (랜덤), payload는 DEK로 1회 암호화, 두 wrapper로 DEK를 각각 wrap (envelope)
- Tauri 파일 쓰기는 `$APPDATA\com.meista765.should-cost-calculator\encrypted.json` 단일 경로로 제한 (capabilities)
- DEK는 React `useRef`로만 보관, 직렬화 금지, pagehide/beforeunload/잠금 시 즉시 폐기
- 비밀번호 변경: 해당 role wrapper만 재생성, payload 무변경 (상수시간)

## 전역 데이터 동기화 (Supabase + GitHub 미러)

관리자의 변경을 **모든 웹/Tauri 클라이언트가 즉시 받아보게** 하려면 Supabase 백엔드 + GitHub 미러 1회 셋업이 필요하다. 미설정 상태에서도 클라이언트는 로컬 전용 모드로 정상 동작한다.

### 1) Supabase 프로비저닝

1. <https://supabase.com/dashboard> 에서 신규 프로젝트 생성, region 은 사내에 가까운 곳.
2. SQL Editor 에 `supabase/migrations/0001_bundles.sql` 을 그대로 붙여넣고 실행 — `bundles` / `bundle_history` + RLS 가 생성된다.
3. **Project Settings → API Keys → "Publishable and secret API keys" 탭** 에서:
   - `Project URL`
   - **Publishable key** (`sb_publishable_...`) — 브라우저 노출 안전, RLS 로 보호됨
   - **Secret key** (`sb_secret_...`) — 서버 전용, RLS 우회 (BYPASSRLS)
   를 각각 메모. legacy `anon` / `service_role` 키는 사용하지 말 것 (deprecation 예정).
4. `.env.local` (커밋 금지) 생성 — `.env.example` 복사 후 값 채우기.

### 2) Edge Function 배포

> ⚠️ Supabase CLI 는 `npm i -g supabase` 가 **막혀 있다** (Go 바이너리라 npm 글로벌 설치 미지원).
> Windows 는 아래 중 하나로 설치/실행:
>
> - **즉시 실행 (설치 X)**: 아래 모든 `supabase ...` 를 `npx supabase@latest ...` 로 prefix
> - **Scoop**: `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git; scoop install supabase`
> - **Winget**: `winget install Supabase.CLI`
> - **프로젝트 로컬**: `npm i -D supabase` 후 `npx supabase ...` (글로벌 -g 만 막힘, devDep 은 OK)

```powershell
# 예: npx 로 1회용 실행 (가장 빠른 길)
npx supabase@latest login
npx supabase@latest link --project-ref <ref>

# 비밀 값 등록 — 관리자 키는 32+자 random 으로 직접 생성하여 관리자에게 별도 채널로 전달
# PowerShell 에는 openssl 이 없을 수 있으므로 .NET API 로 32바이트 random → Base64:
$adminKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
npx supabase@latest secrets set ADMIN_API_KEY=$adminKey
Write-Host "ADMIN_API_KEY = $adminKey   # 안전한 채널로 관리자에게 전달 후 메모리에서 폐기"

# (선택) GitHub 미러 사용 시 (PowerShell 줄바꿈은 backtick `):
npx supabase@latest secrets set `
  GITHUB_APP_ID=<app-id> `
  GITHUB_INSTALLATION_ID=<install-id> `
  GITHUB_REPO=meista765/should-cost-calculator `
  GITHUB_APP_PRIVATE_KEY_PEM="$(Get-Content path\to\app.private-key.pem -Raw)"

# 함수 배포 — JWT 검사는 X-Admin-Key 헤더로 수행하므로 비활성화
# SUPABASE_URL / SUPABASE_SECRET_KEYS 는 Edge Function 런타임이 자동 주입 (별도 secret 등록 불필요)
npx supabase@latest functions deploy save-bundle --no-verify-jwt
```

GitHub App 등록: <https://github.com/settings/apps/new> → permissions `Contents: Read & write` 만 → 단일 repo 에 install → App ID + Installation ID + private key 확보.

### 3) 초기 시드 1회

`bundles` 테이블의 첫 row (id=1) 를 **딱 한 번 손으로 INSERT** 하는 단계.
이후 갱신은 AdminPanel → Edge Function 의 UPDATE 로만 처리하고, 이 스크립트는 다시 실행하지 않는다.
(`save-bundle` 함수는 기존 row 가 없으면 412 로 거부 — 그래서 별도 시드가 필요.)

**(선택) 비밀번호를 새로 정하고 싶을 때만 ① 단계를 실행한다.**
이미 `src/data/encrypted.json` 이 repo 에 있고 그 비밀번호를 알고 있다면 그 파일을 그대로 시드 소스로 쓰면 되므로 ① 은 건너뛰어도 된다.

```powershell
# ① (선택) 평문 Data/*.md → AES-GCM 암호화된 envelope 생성. 관리자/사용자 비번 2개 입력.
npm run encrypt:data
#   - 16자 이상 / 대소문자·숫자·특수문자 포함 / 두 비번이 서로 달라야 함
#   - 결과: src/data/encrypted.json (v2 envelope, ciphertext + wrappers[admin,user])

# ② seed 스크립트가 .env.local 을 자동으로 읽지 **않으므로** PowerShell 세션에 env 를 직접 주입.
$env:SUPABASE_URL = "https://<your-project-ref>.supabase.co"
$env:SUPABASE_SECRET_KEY = "sb_secret_..."     # Publishable 이 아니라 **Secret** key

node scripts/seed-supabase.mjs --label "초기 시드"
#   - encrypted.json 을 읽고 sha256(ciphertext) = etag 로 INSERT
#   - 이미 row 가 있으면 거부 (덮어쓰기 방지) → 정말 다시 하려면 SQL 로 DELETE 후 재실행
```

검증: 대시보드 Table Editor → `bundles` 에 1행 보이거나, 다음 REST 호출이 1개 row JSON 을 반환하면 OK.

```powershell
curl "$env:SUPABASE_URL/rest/v1/bundles?id=eq.1&select=version,etag,updated_by_label" `
  -H "apikey: sb_publishable_..."
```

이후 단가/요율 갱신은 **AdminPanel → 저장 & 재암호화** 한 번으로 끝난다:
- Edge Function 이 Supabase row 갱신 + GitHub 저장소에 `[admin-save] vN ...` 커밋 → Pages workflow 자동 재배포.
- 다른 클라이언트는 다음 부팅(또는 새로고침) 시 새 ciphertext 를 받아 기존 사용자 비번으로 그대로 복호화 (DEK 보존).
- 동시 저장 충돌은 `If-Match: <etag>` 로 검출 → 늦은 쪽이 안내 메시지 후 새로고침해 재시도.

### 키 회전 / 사고 대응

- **Admin API Key 유출 의심**: `supabase secrets set ADMIN_API_KEY=$(openssl rand -base64 32)` 로 즉시 회전 + 관리자에게 새 키 전달.
- **관리자 비밀번호 회전**: AdminPanel 의 "비밀번호 변경" 다이얼로그가 wrapper rotation 후 자동으로 원격 publish.
- **롤백**: Supabase SQL Editor 에서 `bundle_history` 의 이전 row 의 payload/etag 로 `bundles` 행을 수동 UPDATE.