export type PhotoDateSource = "exif" | "file" | "manual" | "unknown";

export type DateCandidateConfidence = "high" | "medium" | "low" | "very_low" | "hint";

export type DateCandidate = {
  field: string;
  raw?: string;
  parsed?: Date;
  confidence: DateCandidateConfidence;
  usedForEffectiveDate: boolean;
};

export type PhotoCrop = {
  x: number;
  y: number;
  size: number;
};

export type PhotoCropMode = "cover" | "contain";

export type PhotoItem = {
  id: string;
  file: File;
  url: string;
  thumbUrl?: string;
  importedAt: number;
  exifDate?: Date;
  fallbackDate?: Date;
  manualDate?: Date;
  dateOverrideField?: string;
  dateCandidates?: DateCandidate[];
  dateSource: PhotoDateSource;
  effectiveDate?: Date;
  effectiveDateField?: string;
  manualOrderIndex: number;
  orderKey: number;
  crop: PhotoCrop;
  cropMode: PhotoCropMode;
  cropIsManual: boolean;
  autoCropConfidence?: number;
};
