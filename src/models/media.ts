import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const findingSchema = new Schema({
  code: { type: String, required: true },
  severity: { type: String, enum: ['info', 'warning', 'error'], required: true },
  message: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  evidence: { type: Schema.Types.Mixed }
}, { _id: false });

const checkSchema = new Schema({
  name: { type: String, required: true },
  status: { type: String, enum: ['pass', 'warning', 'fail', 'not_run'], required: true },
  score: { type: Number, required: true, min: 0, max: 1 },
  summary: { type: String, required: true },
  findings: { type: [findingSchema], default: [] },
  metrics: { type: Schema.Types.Mixed }
}, { _id: false });

const analysisSchema = new Schema({
  overallStatus: { type: String, enum: ['acceptable', 'needs_review'], required: true },
  overallConfidence: { type: Number, required: true, min: 0, max: 1 },
  checks: { type: [checkSchema], default: [] },
  extracted: { type: Schema.Types.Mixed, default: {} },
  metadata: { type: Schema.Types.Mixed, default: {} },
  processingMs: { type: Number, required: true }
}, { _id: false });

const mediaSchema = new Schema({
  processingId: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], required: true, index: true },
  originalFilename: { type: String, required: true },
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  storagePath: { type: String, required: true },
  sha256: { type: String, required: true, index: true },
  perceptualHash: { type: String, index: true },
  failureReason: { type: String },
  attempts: { type: Number, default: 0 },
  analysis: { type: analysisSchema },
  completedAt: { type: Date }
}, { timestamps: true, versionKey: false });

mediaSchema.index({ sha256: 1, createdAt: -1 });
mediaSchema.index({ perceptualHash: 1, createdAt: -1 });

export type MediaDocument = InferSchemaType<typeof mediaSchema> & { _id: mongoose.Types.ObjectId };
export const Media = mongoose.model('Media', mediaSchema);
