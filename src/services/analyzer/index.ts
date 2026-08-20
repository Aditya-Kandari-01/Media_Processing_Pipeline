import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { env } from "../../config/env.js";
import { Media } from "../../models/media.js";
import {
  type AnalysisResult,
  type CheckResult,
  type Finding,
} from "../../types/analysis.js";
import { computePerceptualHash, hammingDistance } from "./phash.js";

const PLATE_REGEX =
  /^(?:[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}|[A-Z]{2}\d{2}[A-Z]{2}\d{4})$/;

function statusFromFindings(findings: Finding[]): CheckResult["status"] {
  if (findings.some((finding) => finding.severity === "error")) return "fail";
  if (findings.some((finding) => finding.severity === "warning"))
    return "warning";
  return "pass";
}

function confidenceFromStatus(status: CheckResult["status"]): number {
  return status === "fail" ? 0.95 : status === "warning" ? 0.8 : 0.92;
}

async function analyseImageProperties(buffer: Buffer) {
  const metadata = await sharp(buffer).metadata();
  const stats = await sharp(buffer).stats();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const sizeBytes = buffer.length;
  const hasExif = Boolean(metadata.exif);
  const mean =
    stats.channels.reduce((sum, channel) => sum + channel.mean, 0) /
    Math.max(stats.channels.length, 1);
  return { metadata, stats, width, height, sizeBytes, hasExif, mean };
}

function buildDimensionCheck(width: number, height: number): CheckResult {
  const findings: Finding[] = [];
  if (width < 640 || height < 480) {
    findings.push({
      code: "LOW_RESOLUTION",
      severity: "warning",
      message: "Image resolution is low for reliable vehicle/OCR analysis.",
      confidence: 0.95,
      evidence: { width, height },
    });
  }
  if (width * height > 40_000_000) {
    findings.push({
      code: "EXCESSIVE_DIMENSIONS",
      severity: "warning",
      message: "Image is unusually large and may increase processing cost.",
      confidence: 0.98,
      evidence: { width, height },
    });
  }
  const status = statusFromFindings(findings);
  return {
    name: "dimensions",
    status,
    score: findings.length ? 0.5 : 1,
    summary: findings.length
      ? findings.map((f) => f.message).join(" ")
      : "Image dimensions are within the expected range.",
    findings,
    metrics: {
      width,
      height,
      megapixels: Number(((width * height) / 1_000_000).toFixed(2)),
    },
  };
}

function buildBrightnessCheck(mean: number): CheckResult {
  const findings: Finding[] = [];
  if (mean < env.LOW_BRIGHTNESS_THRESHOLD) {
    findings.push({
      code: "LOW_LIGHT",
      severity: "warning",
      confidence: 0.9,
      message:
        "Average luminance is low; dark regions may reduce OCR and visual reliability.",
      evidence: {
        meanBrightness: Number(mean.toFixed(2)),
        threshold: env.LOW_BRIGHTNESS_THRESHOLD,
      },
    });
  } else if (mean > env.HIGH_BRIGHTNESS_THRESHOLD) {
    findings.push({
      code: "OVEREXPOSED",
      severity: "warning",
      confidence: 0.88,
      message: "Average luminance is high; highlights may be overexposed.",
      evidence: {
        meanBrightness: Number(mean.toFixed(2)),
        threshold: env.HIGH_BRIGHTNESS_THRESHOLD,
      },
    });
  }
  const status = statusFromFindings(findings);
  return {
    name: "brightness",
    status,
    score: findings.length ? 0.55 : 1,
    summary: findings.length
      ? findings[0]!.message
      : "Average luminance is within the expected range.",
    findings,
    metrics: { meanBrightness: Number(mean.toFixed(2)) },
  };
}

function buildBlurCheck(sharpness: number): CheckResult {
  const findings: Finding[] = [];
  if (sharpness < env.BLUR_THRESHOLD) {
    findings.push({
      code: "POSSIBLE_BLUR",
      severity: "warning",
      confidence: 0.9,
      message:
        "Sharpness score is below the configured threshold; the image may be blurry or out of focus.",
      evidence: {
        sharpness: Number(sharpness.toFixed(2)),
        threshold: env.BLUR_THRESHOLD,
      },
    });
  }
  const status = statusFromFindings(findings);
  return {
    name: "blur",
    status,
    score: findings.length ? 0.45 : 1,
    summary: findings.length
      ? findings[0]!.message
      : "Sharpness is sufficient for downstream checks.",
    findings,
    metrics: { sharpness: Number(sharpness.toFixed(2)) },
  };
}

async function buildDuplicateCheck(
  sha256: string,
  perceptualHash: string,
  processingId?: string,
): Promise<CheckResult> {
  const exact = await Media.findOne({
    sha256,
    ...(processingId ? { processingId: { $ne: processingId } } : {}),
  })
    .select("processingId")
    .lean();
  if (exact) {
    return {
      name: "duplicate",
      status: "warning",
      score: 0.1,
      summary: "An exact byte-for-byte duplicate was found in the system.",
      findings: [
        {
          code: "EXACT_DUPLICATE",
          severity: "warning",
          confidence: 1,
          message:
            "This image has the same SHA-256 digest as an existing upload.",
          evidence: { duplicateOf: exact.processingId, sha256 },
        },
      ],
      metrics: { exactDuplicate: true, perceptualDistance: 0 },
    };
  }

  const candidates = await Media.find({
    perceptualHash: { $exists: true, $ne: null },
  })
    .select("processingId perceptualHash")
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean();
  let best: { id: string; distance: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate.perceptualHash) continue;
    const distance = hammingDistance(perceptualHash, candidate.perceptualHash);
    if (!best || distance < best.distance)
      best = { id: candidate.processingId, distance };
  }
  if (best && best.distance <= env.DUPLICATE_PHASH_DISTANCE) {
    return {
      name: "duplicate",
      status: "warning",
      score: 0.35,
      summary: "The image is visually similar to a previous upload.",
      findings: [
        {
          code: "POSSIBLE_DUPLICATE",
          severity: "warning",
          confidence: 0.88,
          message: "Perceptual hashing indicates a near-duplicate image.",
          evidence: {
            duplicateOf: best.id,
            hammingDistance: best.distance,
            threshold: env.DUPLICATE_PHASH_DISTANCE,
          },
        },
      ],
      metrics: { exactDuplicate: false, perceptualDistance: best.distance },
    };
  }

  return {
    name: "duplicate",
    status: "pass",
    score: 1,
    summary: "No exact or sufficiently similar existing image was found.",
    findings: [],
    metrics: {
      exactDuplicate: false,
      perceptualDistance: best?.distance ?? null,
    },
  };
}

function normalizePlateText(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function buildPlateCheck(rawText: string): {
  check: CheckResult;
  normalized: string;
  valid: boolean;
} {
  const normalized = normalizePlateText(rawText);
  const matches =
    rawText.toUpperCase().match(/[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,3}\s*\d{4}/g) ??
    [];
  const candidate = matches[0] ? normalizePlateText(matches[0]) : normalized;
  const valid = candidate.length >= 8 && PLATE_REGEX.test(candidate);
  if (!rawText.trim()) {
    return {
      normalized: "",
      valid: false,
      check: {
        name: "vehicle_number",
        status: "warning",
        score: 0.5,
        summary:
          "No text was confidently extracted; vehicle number validation could not be established.",
        findings: [
          {
            code: "NO_OCR_TEXT",
            severity: "warning",
            confidence: 0.55,
            message: "OCR returned no usable text.",
          },
        ],
        metrics: { ocrTextPresent: false, formatValid: false },
      },
    };
  }
  if (valid) {
    return {
      normalized: candidate,
      valid: true,
      check: {
        name: "vehicle_number",
        status: "pass",
        score: 1,
        summary: `OCR produced a candidate vehicle number matching the configured Indian plate pattern: ${candidate}.`,
        findings: [
          {
            code: "PLATE_FORMAT_VALID",
            severity: "info",
            confidence: 0.78,
            message: "Extracted vehicle number matches the configured format.",
            evidence: { candidate },
          },
        ],
        metrics: { ocrTextPresent: true, formatValid: true },
      },
    };
  }
  return {
    normalized: candidate,
    valid: false,
    check: {
      name: "vehicle_number",
      status: "warning",
      score: 0.55,
      summary:
        "Text was extracted, but no candidate matched the configured Indian vehicle number format.",
      findings: [
        {
          code: "PLATE_FORMAT_UNCERTAIN",
          severity: "warning",
          confidence: 0.75,
          message:
            "Extracted text did not confidently match the configured plate pattern.",
          evidence: { candidate, rawText: rawText.slice(0, 200) },
        },
      ],
      metrics: { ocrTextPresent: true, formatValid: false },
    },
  };
}

async function runOcr(buffer: Buffer): Promise<string> {
  if (!env.OCR_ENABLED) return "";
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(buffer);
    return result.data.text.trim();
  } finally {
    await worker.terminate();
  }
}

export async function analyseMedia(
  buffer: Buffer,
  sha256: string,
  startedAt: number,
  processingId?: string,
): Promise<AnalysisResult> {
  const { metadata, stats, width, height, sizeBytes, hasExif, mean } =
    await analyseImageProperties(buffer);
  const perceptualHash = await computePerceptualHash(buffer);
  let rawText = "";
  let ocrFailure: string | null = null;
  try {
    rawText = await runOcr(buffer);
  } catch (error) {
    ocrFailure = error instanceof Error ? error.message : "Unknown OCR error";
  }

  const dimensions = buildDimensionCheck(width, height);
  const brightness = buildBrightnessCheck(mean);
  const blur = buildBlurCheck(stats.sharpness);
  const duplicate = await buildDuplicateCheck(
    sha256,
    perceptualHash,
    processingId,
  );
  const plate = buildPlateCheck(rawText);
  const ocrCheck: CheckResult = ocrFailure
    ? {
        name: "ocr",
        status: "warning",
        score: 0,
        summary:
          "OCR was unavailable for this job, so text-based checks may be incomplete.",
        findings: [
          {
            code: "OCR_UNAVAILABLE",
            severity: "warning",
            confidence: 0.98,
            message:
              "OCR could not be executed; the remaining deterministic image checks were still evaluated.",
            evidence: { reason: ocrFailure },
          },
        ],
        metrics: { enabled: env.OCR_ENABLED, available: false },
      }
    : {
        name: "ocr",
        status: rawText ? "pass" : "warning",
        score: rawText ? 1 : 0.55,
        summary: rawText
          ? "OCR produced text for downstream validation."
          : "OCR completed but returned no usable text.",
        findings: rawText
          ? []
          : [
              {
                code: "NO_OCR_TEXT",
                severity: "warning",
                confidence: 0.55,
                message: "OCR returned no usable text.",
              },
            ],
        metrics: {
          enabled: env.OCR_ENABLED,
          available: true,
          textLength: rawText.length,
        },
      };

  const checks = [
    dimensions,
    brightness,
    blur,
    duplicate,
    ocrCheck,
    plate.check,
  ];
  const problematic = checks.filter(
    (check) => check.status === "warning" || check.status === "fail",
  ).length;

  const overallStatus = problematic > 0 ? "needs_review" : "acceptable";

  const overallConfidence =
    checks.reduce((sum, check) => sum + confidenceFromStatus(check.status), 0) /
    checks.length;
  return {
    overallStatus,
    overallConfidence: Number(overallConfidence.toFixed(3)),
    checks,
    extracted: {
      rawText: rawText || undefined,
      normalizedVehicleNumber: plate.valid
  ? plate.normalized
  : undefined,
      vehicleNumberFormatValid: plate.valid,
    },
    metadata: {
      width,
      height,
      format: metadata.format ?? "unknown",
      sizeBytes,
      channels: metadata.channels,
      density: metadata.density,
      hasExif,
    },
    processingMs: Date.now() - startedAt,
  };
}
