import type { V2Block } from "@/lib/course-types";

export type ModuleState = "completed" | "current" | "upcoming";

export function getModuleState(isActive: boolean, isCompleted: boolean): ModuleState {
  if (isCompleted) return "completed";
  if (isActive) return "current";
  return "upcoming";
}

export function getModuleStateLabel(state: ModuleState): string {
  switch (state) {
    case "completed":
      return "Completed";
    case "current":
      return "Current";
    default:
      return "Upcoming";
  }
}

export function getBlockWrapperClass(
  block: V2Block,
  previousBlock?: V2Block,
  nextBlock?: V2Block,
): string {
  const classes = ["v2-block-wrapper"];

  if (block.type === "text" || block.type === "callout") {
    classes.push("v2-block-wrapper-prose");
  } else {
    classes.push("v2-block-wrapper-wide");
  }

  if (block.type === "callout") {
    classes.push("v2-block-wrapper-callout");

    if (previousBlock?.type === "callout") {
      classes.push("v2-block-wrapper-callout-stacked");
    }

    if (nextBlock?.type === "callout") {
      classes.push("v2-block-wrapper-callout-group-endcap");
    }
  }

  if (block.type === "mermaid") {
    classes.push("v2-block-wrapper-diagram");
  }

  return classes.join(" ");
}
