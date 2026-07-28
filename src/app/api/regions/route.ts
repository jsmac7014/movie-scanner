import { NextResponse } from "next/server";
import { regions } from "../../../lib/sample-data";
import { getAllTheaters } from "../../../crawler/theaters";

export const runtime = "nodejs";

export async function GET() {
  const theaters = await getAllTheaters();
  return NextResponse.json({
    regions,
    theatersByRegion: Object.fromEntries(
      regions.map((region) => [
        region.id,
        theaters.filter((theater) => theater.regionId === region.id),
      ]),
    ),
  });
}
