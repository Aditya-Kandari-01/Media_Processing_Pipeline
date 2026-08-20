import { randomUUID } from 'node:crypto';
export const createProcessingId = (): string => `media_${randomUUID()}`;
