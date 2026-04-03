import type { V2Block } from "@/lib/course-types";

export type ModuleState = "current" | "completed" | "upcoming";

export function getModuleState(index: number, activeIndex: number, completedModules: number[]): ModuleState {
  if (index === activeIndex) return "current";
  if (completedModules.includes(index)) return "completed";
  return "upcoming";
}

export function getModuleStateLabel(state: ModuleState): string {
  switch (state) {
    case "current":
      return "Current module";
    case "completed":
      return "Completed module";
    default:
      return "Upcoming module";
  }
}

export function getBlockWrapperClass(block: V2Block): string {
  switch (block.type) {
    case "quiz":
      return "v2-block-wrapper v2-block-wrapper-quiz";
    case "exercise":
      return "v2-block-wrapper v2-block-wrapper-exercise";
    case "code":
      return "v2-block-wrapper v2-block-wrapper-code";
    default:
      return "v2-block-wrapper";
  }
}
