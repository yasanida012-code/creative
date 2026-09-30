# Creative Math&Science — 문제 탐색

수학·과학 문제를 이미지로 올리고, 정답을 맞힌 사람만 해설을 볼 수 있는 커뮤니티 사이트입니다.
로그인(Google 또는 이메일) · 닉네임 · 댓글 토론 · 검색/정렬 기능이 있어요.

- 사이트: GitHub Pages (무료)
- 저장: Firebase Firestore + Authentication (무료 Spark 요금제로 충분)

---

## 파일 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 페이지 뼈대 |
| `style.css` | 디자인 |
| `app.js` | 화면·기능 |
| `backend.js` | Firebase 저장/불러오기 (설정이 비어 있으면 데모 모드) |
| `crypto.js` | 해설을 정답으로 잠그는 암호화 |
| `firebase-config.js` | **내 Firebase 키를 붙여넣는 곳** |
| `firestore.rules` | 데이터베이스 보안 규칙 (Firebase 콘솔에 붙여넣기) |

---

## 1단계. Firebase 프로젝트 만들기 (약 5분)

1. https://console.firebase.google.com 접속 → Google 계정으로 로그인
2. **프로젝트 추가** → 이름 예) `creative-math-science` → Google 애널리틱스는 꺼도 됨 → 만들기
3. 프로젝트 홈에서 **웹 아이콘 `</>`** 클릭 → 앱 닉네임 입력 → "Firebase 호스팅"은 체크하지 않음 → 앱 등록
4. 화면에 나오는 `const firebaseConfig = { ... }` 안의 값들을 복사해서
   이 저장소의 **`firebase-config.js`** 안에 그대로 붙여넣기

## 2단계. 로그인 켜기

1. 왼쪽 메뉴 **빌드 → Authentication** → 시작하기
2. **로그인 방법** 탭에서
   - **Google** → 사용 설정 → 프로젝트 지원 이메일 선택 → 저장
   - **이메일/비밀번호** → 사용 설정 → 저장

## 3단계. 데이터베이스 만들기

1. 왼쪽 메뉴 **빌드 → Firestore Database** → 데이터베이스 만들기
2. 위치: `asia-northeast3 (서울)` 추천 → **프로덕션 모드**로 시작
3. 만들어지면 **규칙(Rules)** 탭 → 기존 내용을 지우고 `firestore.rules` 파일 내용을 전부 붙여넣기 → **게시**

> 이미지는 Firestore 안에 자동으로 압축해서 저장하므로 Storage(유료)는 필요 없어요.

## 4단계. GitHub에 올리고 홈페이지로 열기

1. https://github.com 로그인 → 오른쪽 위 **+ → New repository**
2. 이름 예) `creative-math-science` → **Public** → Create repository
3. **uploading an existing file** 링크 클릭 → 이 폴더의 파일 7개(+README)를 전부 끌어다 놓기 → **Commit changes**
4. 저장소의 **Settings → Pages** →
   Source: **Deploy from a branch**, Branch: **main** / **/(root)** → Save
5. 1~2분 뒤 `https://내아이디.github.io/creative-math-science/` 주소로 사이트가 열립니다.
6. **중요:** Firebase 콘솔 → Authentication → **설정 → 승인된 도메인** → 도메인 추가 →
   `내아이디.github.io` 입력 (이걸 안 하면 Google 로그인이 막혀요)

## 5단계. (선택) 내가 관리자 되기

관리자는 다른 사람의 문제·댓글(스팸 등)도 삭제할 수 있어요.

1. 사이트에서 한 번 로그인
2. Firebase 콘솔 → Authentication → 사용자 탭에서 내 계정의 **사용자 UID** 복사
3. Firestore Database → 데이터 탭 → **컬렉션 시작** → 컬렉션 ID `admins` →
   문서 ID에 복사한 UID 붙여넣기 → 필드 아무거나 하나(예: `name` = `서빈`) → 저장

---

## 나중에 수정할 때

GitHub 저장소에서 파일을 클릭 → 연필 아이콘으로 수정 → Commit 하면 1~2분 뒤 사이트에 반영돼요.
이미 올라온 문제·댓글은 Firebase에 저장돼 있으므로 코드를 바꿔도 사라지지 않아요.

## 알아두면 좋은 점

- **해설 잠금 방식:** 해설은 정답을 열쇠로 암호화해서 저장돼요. 개발자 도구로 봐도 해설 원문이 보이지 않아요.
  다만 정답이 짧은 숫자(예: `3`)면 여러 숫자를 차례로 넣어 보는 식으로 풀 수는 있어요. (직접 입력해 보는 것과 같은 수준)
- **정답 비교:** 띄어쓰기·대소문자·전각문자는 무시해요. `12`, `12개`처럼 여러 형태를 인정하려면 "함께 인정할 답"에 쉼표로 적어 주세요.
- **수식:** 제목·설명·해설·댓글에 `$x^2$`, `$$\int_0^1 x\,dx$$`처럼 쓰면 수식으로 보여요.
- **무료 한도:** Firestore 무료 요금제는 하루 읽기 5만 회·쓰기 2만 회, 저장 1GB. 작은 커뮤니티에는 충분해요.
- **데모 모드:** `firebase-config.js`가 비어 있으면 이 브라우저에만 저장되는 데모로 동작해요. 디자인 확인용.
