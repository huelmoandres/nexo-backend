/** Token DI del cliente Redis dedicado al AiModule. */
export const AI_REDIS_CLIENT = Symbol('AI_REDIS_CLIENT');

/** Token DI del IImageSafetyClassifier. */
export const IMAGE_SAFETY_CLASSIFIER_TOKEN = Symbol(
  'IMAGE_SAFETY_CLASSIFIER_TOKEN',
);

/** Token DI del ITextModerationProvider. */
export const TEXT_MODERATION_PROVIDER_TOKEN = Symbol(
  'TEXT_MODERATION_PROVIDER_TOKEN',
);

/** Token DI del ITextSummarizer. */
export const TEXT_SUMMARIZER_TOKEN = Symbol('TEXT_SUMMARIZER_TOKEN');

/** Prefijo de clave Redis para la caché de inferencia L1. */
export const AI_CACHE_REDIS_PREFIX = 'ai:cache:';

/** Prefijo de clave Redis para los locks distribuidos. */
export const AI_LOCK_REDIS_PREFIX = 'lock:ai:';

/** Máximo de hops permitidos en el árbol de categorías para isCategoryRelated. */
export const CATEGORY_MAX_DEPTH = 10;
