import { parse } from "csv-parse/sync";
import { DateTime } from "luxon";

export type CsvRow = {
  brand: string;
  copy: string;
  on_image_text: string | null;
  scheduled_at: Date;
  image: boolean;
  reel: boolean;
  story: boolean;
  facebook: boolean;
  instagram: boolean;
  tiktok: boolean;
  quality_tier: "cheap" | "standard" | "premium";
  caption_fb: string | null;
  caption_ig: string | null;
  caption_tiktok: string | null;
};

export type ParseResult = {
  rows: CsvRow[];
  errors: { row: number; message: string }[];
};

export async function parseCsv(buffer: Buffer): Promise<ParseResult> {
  const rows: CsvRow[] = [];
  const errors: { row: number; message: string }[] = [];

  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      columns: true,
      trim: true,
      skip_empty_lines: true,
    });
  } catch (e: any) {
    errors.push({ row: 0, message: `CSV parse error: ${e.message}` });
    return { rows, errors };
  }

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 1;
    const record = records[i];
    let hasError = false;

    const pushError = (msg: string) => {
      errors.push({ row: rowNum, message: msg });
      hasError = true;
    };

    const brand = record["brand"] ?? "";
    const copy = record["copy"] ?? "";
    const scheduled_date = record["scheduled_date"] ?? "";
    const scheduled_time = record["scheduled_time"] ?? "";

    if (!brand) pushError("brand is required");
    if (!copy) pushError("copy is required");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) pushError("scheduled_date must be YYYY-MM-DD");
    if (!/^\d{2}:\d{2}$/.test(scheduled_time)) pushError("scheduled_time must be HH:MM");

    let scheduled_at: Date | null = null;
    if (!hasError) {
      const dt = DateTime.fromISO(`${scheduled_date}T${scheduled_time}`, { zone: "America/New_York" });
      if (!dt.isValid) {
        pushError(`Invalid date/time: ${dt.invalidReason}`);
      } else {
        scheduled_at = dt.toJSDate();
      }
    }

    const parseBool = (val: string | undefined) => (val ?? "").trim().toUpperCase() === "TRUE";

    const image = parseBool(record["image"]);
    const reel = parseBool(record["reel"]);
    const story = parseBool(record["story"]);
    const facebook = parseBool(record["facebook"]);
    const instagram = parseBool(record["instagram"]);
    const tiktok = parseBool(record["tiktok"]);

    if (!image && !reel && !story) pushError("At least one of image/reel/story must be TRUE");
    if (!facebook && !instagram) pushError("At least one of facebook/instagram must be TRUE");

    const rawTier = (record["quality_tier"] ?? "").trim().toLowerCase();
    let quality_tier: "cheap" | "standard" | "premium" = "standard";
    if (rawTier === "") {
      quality_tier = "standard";
    } else if (rawTier === "cheap" || rawTier === "standard" || rawTier === "premium") {
      quality_tier = rawTier;
    } else {
      pushError(`quality_tier must be cheap|standard|premium, got '${rawTier}'`);
    }

    const on_image_text = (record["on_image_text"] ?? "").trim() || null;
    const caption_fb = (record["caption_fb"] ?? "").trim() || null;
    const caption_ig = (record["caption_ig"] ?? "").trim() || null;
    const caption_tiktok = (record["caption_tiktok"] ?? "").trim() || null;

    if (hasError) continue;

    rows.push({
      brand,
      copy,
      on_image_text,
      scheduled_at: scheduled_at!,
      image,
      reel,
      story,
      facebook,
      instagram,
      tiktok,
      quality_tier,
      caption_fb,
      caption_ig,
      caption_tiktok,
    });
  }

  return { rows, errors };
}
