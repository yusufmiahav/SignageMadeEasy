import type { Folder, LibraryItem } from '../api/types';

interface DiagramNode {
  id: string;
  label: string;
  kind: 'folder' | 'items';
  children: DiagramNode[];
}

// Each subfolder recurses into its own node (however deep the nesting goes); a
// folder's own direct items are grouped into a single "N items" leaf rather than
// one node per item, since a folder with a hundred files would otherwise make the
// diagram unreadable — the item COUNT is what matters for a structure overview.
function buildNode(folder: Folder, folders: Folder[], items: LibraryItem[]): DiagramNode {
  const childFolders = folders
    .filter((f) => (f.parentId ?? null) === folder.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const directItemCount = items.filter((i) => (i.folderId ?? null) === folder.id).length;
  const children: DiagramNode[] = childFolders.map((f) => buildNode(f, folders, items));
  if (directItemCount > 0) {
    children.push({
      id: `${folder.id}-items`,
      label: `${directItemCount} item${directItemCount === 1 ? '' : 's'}`,
      kind: 'items',
      children: [],
    });
  }
  return { id: folder.id, label: folder.name, kind: 'folder', children };
}

interface LayoutNode extends DiagramNode {
  x: number;
  y: number;
  children: LayoutNode[];
}

const NODE_WIDTH = 120;
const NODE_HEIGHT = 40;
const LEVEL_HEIGHT = 88;
const UNIT_WIDTH = 136;

// Classic leaf-counting tree layout: every leaf gets its own equally-spaced
// x-slot left to right, and every parent sits centered above the span of its
// children — the same technique an org-chart/mind-map tool uses, just hand-rolled
// since this app has no diagramming library.
function layout(node: DiagramNode, depth: number, cursor: { next: number }): LayoutNode {
  if (node.children.length === 0) {
    const x = cursor.next * UNIT_WIDTH + UNIT_WIDTH / 2;
    cursor.next += 1;
    return { ...node, x, y: depth * LEVEL_HEIGHT, children: [] };
  }
  const laidOutChildren = node.children.map((c) => layout(c, depth + 1, cursor));
  const first = laidOutChildren[0];
  const last = laidOutChildren[laidOutChildren.length - 1];
  return { ...node, x: (first.x + last.x) / 2, y: depth * LEVEL_HEIGHT, children: laidOutChildren };
}

function countLeaves(node: DiagramNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

function maxDepth(node: DiagramNode): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(maxDepth));
}

function DiagramNodeGroup({ node }: { node: LayoutNode }) {
  return (
    <g>
      {node.children.map((child) => (
        <path
          key={`edge-${child.id}`}
          d={`M ${node.x} ${node.y + NODE_HEIGHT / 2} V ${node.y + LEVEL_HEIGHT / 2} H ${child.x} V ${child.y - NODE_HEIGHT / 2}`}
          fill="none"
          stroke="var(--color-divider)"
          strokeWidth={1.5}
        />
      ))}
      <rect
        x={node.x - NODE_WIDTH / 2}
        y={node.y - NODE_HEIGHT / 2}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={8}
        fill={node.kind === 'items' ? 'var(--color-bg)' : 'var(--color-surface)'}
        stroke={node.kind === 'items' ? 'var(--color-divider)' : 'var(--color-accent)'}
        strokeWidth={1.5}
        strokeDasharray={node.kind === 'items' ? '4 3' : undefined}
      />
      <text
        x={node.x}
        y={node.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={node.kind === 'folder' ? 600 : 400}
        fill="var(--color-text)"
        style={{ pointerEvents: 'none' }}
      >
        {node.label.length > 16 ? `${node.label.slice(0, 15)}…` : node.label}
      </text>
      {node.children.map((child) => (
        <DiagramNodeGroup key={child.id} node={child} />
      ))}
    </g>
  );
}

interface FolderFlowDiagramProps {
  folder: Folder;
  folders: Folder[];
  items: LibraryItem[];
}

/** Real flow-chart-style diagram (connecting lines, org-chart layout) of a folder's
    nested structure — subfolders as their own boxes recursing arbitrarily deep,
    each folder's direct items rolled up into one dashed "N items" leaf. */
export function FolderFlowDiagram({ folder, folders, items }: FolderFlowDiagramProps) {
  const root = buildNode(folder, folders, items);
  if (root.children.length === 0) {
    return <p className="text-muted" style={{ margin: 0, fontSize: 12 }}>This folder is empty — nothing to diagram yet.</p>;
  }
  const laidOut = layout(root, 0, { next: 0 });
  const width = countLeaves(root) * UNIT_WIDTH;
  // +NODE_HEIGHT gives the root's top edge and the deepest row's bottom edge room —
  // node y positions are 0-indexed by depth, so without this the root box clips
  // against the svg's own top boundary.
  const height = (maxDepth(root) + 1) * LEVEL_HEIGHT + NODE_HEIGHT;
  return (
    <div style={{ overflow: 'auto', border: '1px solid var(--color-divider)', borderRadius: 8, padding: 8 }}>
      <svg width={width} height={height} style={{ display: 'block', minWidth: '100%' }} viewBox={`0 0 ${width} ${height}`}>
        <g transform={`translate(0, ${NODE_HEIGHT / 2})`}>
          <DiagramNodeGroup node={laidOut} />
        </g>
      </svg>
    </div>
  );
}
