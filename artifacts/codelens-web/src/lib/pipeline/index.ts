export { PipelineEmitter, getOrCreateEmitter, removeEmitter } from "./events";
export type { PipelineEvent, PipelineEventType } from "./events";
export {
  runStage1Abstractions,
  runStage2Relationships,
  runStage3Order,
  runStage4WriteChapters,
  assembleV2Course,
} from "./stages";
export type {
  Abstraction,
  Relationship,
  OrderedChapter,
  ChapterResult,
  PipelineConfig,
} from "./stages";
