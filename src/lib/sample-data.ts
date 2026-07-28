import type { Region, Theater } from "./types";

export const regions: Region[] = [
  { id: "seoul", name: "서울" },
  { id: "gyeonggi", name: "경기" },
  { id: "incheon", name: "인천" },
  { id: "chungcheong", name: "대전/충청/세종" },
  { id: "gyeongsang", name: "부산/대구/경상" },
  { id: "jeolla", name: "광주/전라" },
  { id: "gangwon", name: "강원" },
  { id: "jeju", name: "제주" },
];

// CGV는 영화관 목록/시간표 모두 봇 차단이 있어 확인된 지점만 폴백으로 유지한다.
// 메가박스와 롯데는 각 체인의 실제 영화관 목록 API에서 동적으로 불러온다.
export const cgvTheaters: Theater[] = [
  { id: "cgv-wangsimni", name: "CGV 왕십리", chain: "CGV", regionId: "seoul", address: "서울", chainTheaterId: "0056" },
  { id: "cgv-hongdae", name: "CGV 홍대", chain: "CGV", regionId: "seoul", address: "서울", chainTheaterId: "0040" },
  { id: "cgv-yongsan", name: "CGV 용산아이파크몰", chain: "CGV", regionId: "seoul", address: "서울", chainTheaterId: "0013" },
  { id: "cgv-yongin", name: "CGV 용인테크노밸리", chain: "CGV", regionId: "gyeonggi", address: "경기", chainTheaterId: "0163" },
  { id: "cgv-songdo", name: "CGV 송도", chain: "CGV", regionId: "incheon", address: "인천", chainTheaterId: "0145" },
  { id: "cgv-daejeon", name: "CGV 대전중앙로", chain: "CGV", regionId: "chungcheong", address: "대전", chainTheaterId: "0118" },
  { id: "cgv-haeundae", name: "CGV 해운대", chain: "CGV", regionId: "gyeongsang", address: "부산", chainTheaterId: "0006" },
  { id: "cgv-dongdaegu", name: "CGV 동대구", chain: "CGV", regionId: "gyeongsang", address: "대구", chainTheaterId: "0048" },
];

export function getRegion(regionId: string): Region | undefined {
  return regions.find((r) => r.id === regionId);
}
