import type { Metadata } from "next";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://web-production-f6926.up.railway.app"),
  applicationName: "MovieScanner",
  title: "영화 상영시간표·잔여좌석 비교 | MovieScanner",
  description: "CGV, 롯데시네마, 메가박스의 영화 상영시간과 실시간 잔여 좌석을 지역별·날짜별로 한눈에 비교하세요.",
  keywords: [
    "영화 상영시간표",
    "영화관 잔여좌석",
    "CGV 상영시간표",
    "롯데시네마 상영시간표",
    "메가박스 상영시간표",
    "영화 예매",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "MovieScanner",
    title: "영화 상영시간표·잔여좌석 비교 | MovieScanner",
    description: "CGV, 롯데시네마, 메가박스의 상영시간과 실시간 잔여 좌석을 한눈에 비교하세요.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "영화 상영시간표·잔여좌석 비교 | MovieScanner",
    description: "CGV, 롯데시네마, 메가박스의 상영시간과 실시간 잔여 좌석을 한눈에 비교하세요.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
