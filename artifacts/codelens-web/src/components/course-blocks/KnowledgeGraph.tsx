"use client";

import dynamic from "next/dynamic";
import type { V2OverviewGraph } from "@/lib/course-types";

interface KnowledgeGraphProps {
  overviewGraph: V2OverviewGraph;
  onModuleClick: (moduleIndex: number, conceptName?: string) => void;
}

const KnowledgeGraphContent = dynamic(
  () => import("./KnowledgeGraphContent"),
  {
    loading: () => <div className="animate-pulse h-64 bg-gray-100 rounded-lg" />,
    ssr: false,
  }
);

export function KnowledgeGraph({ overviewGraph, onModuleClick }: KnowledgeGraphProps) {
  return <KnowledgeGraphContent overviewGraph={overviewGraph} onModuleClick={onModuleClick} />;
}
