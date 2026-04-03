"use client";

import { useEffect, useMemo, useState } from "react";
import type { V2Module, V2OverviewGraph } from "@/lib/course-types";

interface AbstractionMapProps {
  graph: V2OverviewGraph;
  onModuleClick: (moduleIndex: number, conceptLabel?: string) => void;
  modules?: V2Module[];
}

interface RelationshipView {
  id: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  relation: string;
  description: string;
}

export function AbstractionMap({ graph, onModuleClick, modules = [] }: AbstractionMapProps) {
  const [search, setSearch] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph.nodes[0]?.id ?? null);

  const nodes = useMemo(
    () =>
      [...graph.nodes]
        .map((node) => {
          const exactModuleIndex = modules.findIndex(
            (module) => module.index === node.moduleIndex,
          );
          const matchedModuleIndex = exactModuleIndex >= 0 ? exactModuleIndex : modules.findIndex((module) => {
            const moduleTitle = module.title.trim().toLowerCase();
            const nodeLabel = node.label.trim().toLowerCase();
            return moduleTitle === nodeLabel || moduleTitle.includes(nodeLabel) || nodeLabel.includes(moduleTitle);
          });

          return {
            ...node,
            moduleIndex: matchedModuleIndex >= 0 ? matchedModuleIndex : Math.max(node.moduleIndex, 0),
            description: node.description || (matchedModuleIndex >= 0 ? modules[matchedModuleIndex]?.learningObjective : undefined),
          };
        })
        .sort((a, b) => a.moduleIndex - b.moduleIndex || a.label.localeCompare(b.label)),
    [graph.nodes, modules],
  );

  const moduleSerialByNodeId = useMemo(
    () => new Map(nodes.map((node, index) => [node.id, index + 1])),
    [nodes],
  );

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  useEffect(() => {
    if (!selectedNodeId || !nodeMap.has(selectedNodeId)) {
      setSelectedNodeId(nodes[0]?.id ?? null);
    }
  }, [nodeMap, nodes, selectedNodeId]);

  const relationships = useMemo<RelationshipView[]>(() => {
    return graph.edges
      .map((edge, index) => {
        const fromNode = nodeMap.get(edge.from);
        const toNode = nodeMap.get(edge.to);
        if (!fromNode || !toNode) return null;

        return {
          id: `${edge.from}-${edge.to}-${index}`,
          fromId: edge.from,
          toId: edge.to,
          fromLabel: fromNode.label,
          toLabel: toNode.label,
          relation: edge.relation,
          description: edge.label || edge.relation,
        };
      })
      .filter((edge): edge is RelationshipView => !!edge);
  }, [graph.edges, nodeMap]);

  const searchTerm = search.trim().toLowerCase();
  const filteredNodes = useMemo(() => {
    if (!searchTerm) return nodes;
    return nodes.filter((node) => {
      const haystack = `${node.label} ${node.description || ""}`.toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [nodes, searchTerm]);

  useEffect(() => {
    if (!filteredNodes.length) return;
    if (!selectedNodeId || !filteredNodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(filteredNodes[0].id);
    }
  }, [filteredNodes, selectedNodeId]);

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null;
  const selectedNodeModuleSerial = selectedNode
    ? moduleSerialByNodeId.get(selectedNode.id) ?? selectedNode.moduleIndex + 1
    : null;

  const selectedRelationships = useMemo(() => {
    if (!selectedNodeId) return relationships.slice(0, 10);
    return relationships.filter(
      (edge) => edge.fromId === selectedNodeId || edge.toId === selectedNodeId,
    );
  }, [relationships, selectedNodeId]);

  const strongestNode = useMemo(
    () => [...nodes].sort((a, b) => b.connections - a.connections || a.moduleIndex - b.moduleIndex)[0] ?? null,
    [nodes],
  );

  return (
    <section className="v2-abstraction-map" aria-label="Abstraction map overview">
      <div className="v2-abstraction-map-hero">
        <div>
          <div className="v2-abstraction-map-eyebrow">Start Here</div>
          <h3 className="v2-abstraction-map-title">How the codebase is organized</h3>
          <p className="v2-abstraction-map-copy">
            Use this map to move from big concepts to the exact learning module that explains them. Pick a concept to see why it matters, what it connects to, and where to go next.
          </p>
        </div>
        <div className="v2-abstraction-map-stats" aria-label="Abstraction map stats">
          <div className="v2-abstraction-stat">
            <span className="v2-abstraction-stat-value">{graph.nodes.length}</span>
            <span className="v2-abstraction-stat-label">Core concepts</span>
          </div>
          <div className="v2-abstraction-stat">
            <span className="v2-abstraction-stat-value">{relationships.length}</span>
            <span className="v2-abstraction-stat-label">Connections</span>
          </div>
          {strongestNode && (
            <div className="v2-abstraction-stat">
              <span className="v2-abstraction-stat-value">{strongestNode.label}</span>
              <span className="v2-abstraction-stat-label">Best first deep dive</span>
            </div>
          )}
        </div>
      </div>

      <div className="v2-abstraction-map-toolbar">
        <label className="v2-abstraction-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search concepts…"
            aria-label="Search abstraction concepts"
          />
        </label>
        <div className="v2-abstraction-help">
          <span className="v2-abstraction-help-kicker">How to use it</span>
          <span>1. Pick a concept 2. Review its connections 3. Open its module</span>
        </div>
      </div>

      <div className="v2-abstraction-layout">
        <div className="v2-abstraction-grid" role="list" aria-label="Abstraction concepts">
          {filteredNodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const moduleSerial = moduleSerialByNodeId.get(node.id) ?? node.moduleIndex + 1;
            return (
              <button
                key={node.id}
                type="button"
                className={`v2-abstraction-card ${isSelected ? "v2-abstraction-card-active" : ""}`}
                onClick={() => setSelectedNodeId(node.id)}
                aria-pressed={isSelected}
              >
                <span className="v2-abstraction-card-topline">
                  <span className="v2-abstraction-card-module">Module {moduleSerial}</span>
                  <span className="v2-abstraction-card-count">{node.connections} links</span>
                </span>
                <span className="v2-abstraction-card-title">{node.label}</span>
                <span className="v2-abstraction-card-desc">
                  {node.description || "Core subsystem in this codebase."}
                </span>
                <span className="v2-abstraction-card-footer">
                  <span>{node.fileCount ?? 0} files</span>
                  <span>{isSelected ? "Selected" : "Inspect"}</span>
                </span>
              </button>
            );
          })}
          {!filteredNodes.length && (
            <div className="v2-abstraction-empty">No concepts match that search yet.</div>
          )}
        </div>

        <aside className="v2-abstraction-details" aria-live="polite">
          {selectedNode ? (
            <>
              <div className="v2-abstraction-details-header">
                <div>
                  <div className="v2-abstraction-details-kicker">Selected concept</div>
                  <h4 className="v2-abstraction-details-title">{selectedNode.label}</h4>
                </div>
                <button
                  type="button"
                  className="v2-abstraction-open-btn"
                  onClick={() => onModuleClick(selectedNode.moduleIndex, selectedNode.label)}
                >
                  Open Module {selectedNodeModuleSerial}
                </button>
              </div>

              <p className="v2-abstraction-details-copy">
                {selectedNode.description || "This concept groups the files and behaviors you need to understand together."}
              </p>

              <div className="v2-abstraction-detail-pills">
                <span className="v2-abstraction-detail-pill">{selectedNode.connections} related concepts</span>
                <span className="v2-abstraction-detail-pill">{selectedNode.fileCount ?? 0} files covered</span>
              </div>

              <div className="v2-abstraction-relationship-panel">
                <div className="v2-abstraction-relationship-head">
                  <h5>What it touches</h5>
                  <span>{selectedRelationships.length} connection{selectedRelationships.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="v2-abstraction-relationship-list">
                  {selectedRelationships.length > 0 ? (
                    selectedRelationships.map((edge) => {
                      const otherLabel = edge.fromId === selectedNode.id ? edge.toLabel : edge.fromLabel;
                      const otherNode = edge.fromId === selectedNode.id ? nodeMap.get(edge.toId) : nodeMap.get(edge.fromId);
                      return (
                        <button
                          key={edge.id}
                          type="button"
                          className="v2-abstraction-relationship-item"
                          onClick={() => {
                            if (!otherNode) return;
                            setSelectedNodeId(otherNode.id);
                            onModuleClick(otherNode.moduleIndex, otherLabel);
                          }}
                        >
                          <span className="v2-abstraction-relationship-target">{otherLabel}</span>
                          <span className="v2-abstraction-relationship-copy">{edge.description}</span>
                        </button>
                      );
                    })
                  ) : (
                    <div className="v2-abstraction-empty v2-abstraction-empty-compact">
                      This concept is relatively self-contained.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="v2-abstraction-empty">Select a concept to explore it.</div>
          )}
        </aside>
      </div>
    </section>
  );
}
