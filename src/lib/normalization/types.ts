import type { DataQualityIssue } from "../../types";

export interface NormalizationResult<T> {
  records: T[];
  issues: DataQualityIssue[];
}

export interface NormalizedRecordResult<T> {
  record: T;
  issues: DataQualityIssue[];
}
