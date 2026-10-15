// 여행 일정 기본 데이터
// - 누구나 앱에서 이름·시간·메모를 바꾸거나 건너뛸 수 있어요. (바뀐 내용은 구글 시트에 따로 저장돼요)
// - time: '10:30' 처럼 적으면 카드에 시간이 보여요. 모르면 비워 두세요.
// - address 가 있으면 주소로, 없으면 query(없으면 name)로 지도 검색을 해요.
// - naverUrl / kakaoUrl 이 있으면 그 링크를 가장 먼저 써요.
window.TRIP_DAYS = [
  {
    no: 1, label: '1일차', date: '10/16 금', dateLong: '10월 16일 (금)', iso: '2026-10-16',
    title: '숲길 산책과 서귀포 바다',
    items: [
      { id: 'd1-1', kind: 'place', tag: '이동', time: '', name: '제주공항 (렌터카)', query: '제주국제공항', intro: '도착하면 렌터카를 받고 여행 시작! 짐은 차에 싣고 출발해요.' },
      { id: 'd1-2', kind: 'place', tag: '관광', time: '', name: '절물자연휴양림 (사려니숲길)', query: '절물자연휴양림', intro: '삼나무 숲 사이로 난 평탄한 산책길. 가을 숲 공기를 마음껏 마셔요.' },
      { id: 'd1-3', kind: 'place', tag: '식사', time: '', name: '소낭밭해장국', address: '제주 서귀포시 대포복개로110번길 133', intro: '든든한 해장국으로 첫 점심. 오전 산책 뒤 몸을 데워요.' },
      { id: 'd1-4', kind: 'place', tag: '관광', time: '', name: '외돌개', query: '서귀포 외돌개', intro: '바다 위에 홀로 선 바위. 올레길 7코스의 대표 풍경이에요.' },
      { id: 'd1-5', kind: 'place', tag: '관광', time: '', name: '정방폭포', query: '서귀포 정방폭포', intro: '물줄기가 바다로 바로 떨어지는 폭포. 계단은 천천히 내려가요.' },
      { id: 'd1-6', kind: 'place', tag: '관광', time: '', name: '쇠소깍', query: '서귀포 쇠소깍', intro: '민물과 바닷물이 만나는 에메랄드빛 계곡. 산책로가 짧고 편해요.' },
      { id: 'd1-7', kind: 'place', tag: '식사', time: '', name: '서귀포매일올레시장', intro: '저녁은 시장에서! 귤, 회, 꼬치를 골라 먹는 재미가 있어요.' },
      { id: 'd1-8', kind: 'place', tag: '숙박', time: '', name: '소노캄 제주', intro: '첫날 밤 숙소. 체크인하고 푹 쉬어요.' }
    ]
  },
  {
    no: 2, label: '2일차', date: '10/17 토', dateLong: '10월 17일 (토)', iso: '2026-10-17',
    title: '동쪽 바다와 해녀 이야기',
    items: [
      { id: 'd2-1', kind: 'place', tag: '이동', time: '', name: '소노캄 제주 (체크아웃)', query: '소노캄 제주', intro: '짐 챙겨서 체크아웃. 두고 온 물건이 없는지 한 번 더 확인해요.' },
      { id: 'd2-2', kind: 'place', tag: '관광', time: '', name: '표선해수욕장', intro: '넓고 얕은 하얀 모래사장. 아침 바닷가 산책에 좋아요.' },
      { id: 'd2-3', kind: 'place', tag: '관광', time: '', name: '뷰제주하늘', address: '제주 서귀포시 성산읍 서성일로 397', intro: '성산 쪽 탁 트인 풍경을 보며 쉬어 가는 곳이에요.' },
      { id: 'd2-4', kind: 'choice', tag: '식사', time: '', name: '점심 (둘 중 한 곳)', intro: '두 곳 중 한 곳을 골라요. 당일 컨디션과 대기 줄을 보고 정해요.',
        options: [
          { id: 'd2-4a', name: '성산바다풍경', address: '제주 서귀포시 성산읍 일출로288번길 17', intro: '성산 바다를 보며 먹는 해산물 점심.' },
          { id: 'd2-4b', name: '성산갈치 친정집 본점', address: '제주 서귀포시 성산읍 일출로 260', intro: '제주에 왔으니 갈치 한 상. 여럿이 나눠 먹기 좋아요.' }
        ] },
      { id: 'd2-5', kind: 'place', tag: '관광', time: '', name: '빛의 벙커', query: '빛의벙커 제주', intro: '옛 벙커 안에서 보는 미디어아트 전시. 실내라 날씨 걱정 없어요.' },
      { id: 'd2-6', kind: 'place', tag: '관광', time: '', name: '제주해녀박물관', intro: '제주 해녀의 삶과 물질 도구를 볼 수 있는 박물관이에요.' },
      { id: 'd2-7', kind: 'place', tag: '관광', time: '', name: '김녕 요트투어', address: '제주 제주시 구좌읍 구좌해안로 229-16', intro: '요트를 타고 김녕 앞바다로. 바람이 차니 겉옷을 챙겨요.' },
      { id: 'd2-8', kind: 'place', tag: '식사', time: '', name: '동복해녀해산물직판장', naverUrl: 'https://naver.me/xa5R8RKC', intro: '해녀가 잡은 해산물로 차리는 저녁.' },
      { id: 'd2-9', kind: 'place', tag: '숙박', time: '', name: '김녕 숙소', address: '제주 제주시 구좌읍 김녕리 4052', intro: '둘째 날 밤 숙소. 김녕 바다 가까이에서 쉬어요.' }
    ]
  },
  {
    no: 3, label: '3일차', date: '10/18 일', dateLong: '10월 18일 (일)', iso: '2026-10-18',
    title: '김녕에서 공항까지',
    items: [
      { id: 'd3-1', kind: 'place', tag: '식사', time: '', name: '바다는김녕', address: '제주 제주시 구좌읍 김녕로21길 25', intro: '김녕 바다를 보며 시작하는 마지막 날.' },
      { id: 'd3-2', kind: 'place', tag: '관광', time: '', name: '만장굴', query: '제주 만장굴', intro: '세계자연유산 용암동굴. 안은 서늘하고 바닥이 젖어 있으니 편한 신발로.' },
      { id: 'd3-3', kind: 'place', tag: '식사', time: '', name: '나는 지금 생선이 먹고 싶다', address: '제주 제주시 오일장서길 26', intro: '여행 마지막 점심은 생선 요리로.' },
      { id: 'd3-4', kind: 'recommend', tag: '추천', time: '', name: '공항 근처 발 마사지', intro: '비행기 타기 전, 많이 걸은 다리를 풀어 줘요.' },
      { id: 'd3-5', kind: 'place', tag: '이동', time: '', name: 'SK렌터카 반납', query: 'SK렌터카 제주공항', intro: '기름을 채우고 차를 반납해요. 셔틀로 공항까지 이동해요.' },
      { id: 'd3-6', kind: 'place', tag: '이동', time: '', name: '제주공항 출발', query: '제주국제공항', intro: '사흘 동안 수고 많았어요. 조심히 들어가요!' }
    ]
  }
];
