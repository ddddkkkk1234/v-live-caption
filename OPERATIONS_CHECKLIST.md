# V-Live Caption 운영 점검 체크리스트

## 1. STT Provider 실제 API 키 테스트

각 provider는 실제 계정, 키, 무료 티어 상태, 오디오 포맷 지원이 달라서 배포 환경에서 짧은 음성으로 직접 확인해야 합니다.

권장 순서:

1. Groq
   - 환경변수: `GROQ_API_KEY`
   - 모델: `whisper-large-v3`, `whisper-large-v3-turbo`
   - 기대값: `/api/stt`가 `{ text, provider: "groq" }` 반환

2. OpenAI
   - 환경변수: `OPENAI_API_KEY`
   - 모델: `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1`

3. Gladia
   - 환경변수: `GLADIA_API_KEY`
   - 화자 분리 옵션 우선 테스트
   - 기대값: 화자 분리 사용 시 `발화자 A: ...` 형식

4. Speechmatics
   - 환경변수: `SPEECHMATICS_API_KEY`
   - `enhanced`, `standard` 모델 각각 확인

5. IBM Watson STT
   - 환경변수: `IBM_STT_API_KEY`
   - 사용자 입력 추가값: 서비스 URL

6. Azure Speech
   - 환경변수: `AZURE_SPEECH_KEY`
   - 사용자 입력 추가값: 리전
   - 주의: 브라우저 녹음 포맷에 따라 실패할 수 있으므로 OGG Opus 지원 환경에서 우선 테스트

테스트 기준:

- 4초 내외 한국어 음성
- 4초 내외 영어 음성
- 무음 또는 잡음 입력
- API 키 누락 상태
- 잘못된 API 키 상태

## 2. 번역 자막 비용/지연 점검

현재 번역 자막은 AI API를 사용합니다.

- 최소 요청 간격: `TRANSLATION_MIN_INTERVAL_MS = 2500`
- 번역 중 새 조각이 들어오면 원문을 우선 표시
- 동일 조각은 메모리 캐시 재사용

운영 전 확인:

- 1분 사용 시 AI 요청 수
- 번역 지연 체감
- 무료 API 한도 소진 속도

## 3. Supabase 공유 자막 정책 점검

공유 자막은 Supabase Realtime broadcast를 사용합니다. 운영 전 다음을 확인하세요.

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`가 배포 환경변수에만 있음
- Supabase anon key가 service role key가 아님
- Realtime 기능이 필요한 채널에만 허용됨
- 민감한 대화 공유 금지 안내가 UI에 표시됨
- 방 번호는 임의 추측 가능하므로 중요한 행사에서는 긴 room id 사용 검토

권장 개선:

- 4자리 숫자 방 번호 대신 8자 이상 랜덤 코드
- 방 생성 후 일정 시간 만료
- 송출자/수신자 권한 분리
- 남용 방지를 위한 rate limit

## 4. Cloudflare 환경변수

필수/선택 환경변수:

- `ALLOWED_ORIGINS`
- `GROQ_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY` 또는 `GOOGLE_AI_KEY`
- `GLADIA_API_KEY`
- `SPEECHMATICS_API_KEY`
- `IBM_STT_API_KEY`
- `AZURE_SPEECH_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
