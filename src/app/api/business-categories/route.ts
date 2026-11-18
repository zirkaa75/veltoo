import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const instant = false;

const noCacheHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const { data, error } = await createAdminClient()
      .from("business_categories")
      .select("name")
      .eq("status", "active")
      .order("name");

    if (error) {
      console.error("Could not load active business categories:", error.message);
      return NextResponse.json(
        { error: "Business categories lama soo qaadi karin." },
        { status: 503, headers: noCacheHeaders },
      );
    }

    return NextResponse.json(
      { categories: (data ?? []).map((category) => category.name) },
      { headers: noCacheHeaders },
    );
  } catch (error) {
    console.error(
      "Could not load active business categories:",
      error instanceof Error ? error.message : "Unknown category loading error.",
    );
    return NextResponse.json(
      { error: "Business categories lama soo qaadi karin." },
      { status: 503, headers: noCacheHeaders },
    );
  }
}
