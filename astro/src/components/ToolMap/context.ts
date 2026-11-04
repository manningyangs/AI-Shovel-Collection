import { createContext } from 'react';

/** 供 ToolNode 读取的交互状态（选中/悬停/邻居），避免因高亮重建 nodes 覆盖拖动位置 */
export const MapInteractionContext = createContext<{
  selectedId: string | null;
  hoverId: string | null;
  neighbors: Set<string>;
  onSelect: (id: string | null) => void;
}>({ selectedId: null, hoverId: null, neighbors: new Set(), onSelect: () => {} });
