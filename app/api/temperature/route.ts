import { createInitialReadings } from "@/lib/temperature";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    readings: createInitialReadings(),
    pollIntervalMs: 5000,
  });
}
