export type FindingSeverity = 'info' | 'warning' | 'error';
export type CheckStatus = 'pass' | 'warning' | 'fail' | 'not_run';

export interface Finding {
  code: string;
  severity: FindingSeverity;
  message: string;
  confidence: number;
  evidence?: Record<string, unknown>;
}

export interface CheckResult {
  name: string;
  status: CheckStatus;
  score: number;
  summary: string;
  findings: Finding[];
  metrics?: Record<string, number | string | boolean | null>;
}

export interface AnalysisResult {
  overallStatus: 'acceptable' | 'needs_review';
  overallConfidence: number;
  checks: CheckResult[];
  extracted: {
    rawText?: string;
    normalizedVehicleNumber?: string;
    vehicleNumberFormatValid?: boolean;
  };
  metadata: {
    width: number;
    height: number;
    format: string;
    sizeBytes: number;
    channels?: number;
    density?: number;
    hasExif: boolean;
  };
  processingMs: number;
}
