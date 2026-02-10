// Re-export from @usopc/shared — the entity class was extracted to the shared
// package so both ingestion and web can use it without cross-package imports.
export {
  SourceConfigEntity,
  type SourceConfig,
  type CreateSourceInput,
  type MarkSuccessOptions,
} from "@usopc/shared";
