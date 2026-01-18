import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { useStore } from '../store/useStore';
import { getGroupsByCustomOrder, getLayersByGroupCustomOrder } from '../data/layerManifest';
import type { LayerConfig, LayerGroup, LayerOrderConfig } from '../types';

interface DraggableLayerListProps {
  onIsolate: (layerId: string | null) => void;
  isolatedLayerId: string | null;
}

export function DraggableLayerList({ onIsolate, isolatedLayerId }: DraggableLayerListProps) {
  const {
    activeLayers,
    toggleLayer,
    layerOrder,
    setGroupOrder,
    setLayerOrderInGroup,
  } = useStore();

  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [dragContext, setDragContext] = useState<'group' | 'layer' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const groups = getGroupsByCustomOrder(layerOrder);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = active.id as string;

    // Check if this is a group drag or layer drag
    if (id.startsWith('group-')) {
      setActiveGroupId(id.replace('group-', ''));
      setDragContext('group');
    } else if (id.startsWith('layer-')) {
      setActiveLayerId(id.replace('layer-', ''));
      setDragContext('layer');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      setActiveGroupId(null);
      setActiveLayerId(null);
      setDragContext(null);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    if (dragContext === 'group') {
      // Reordering groups
      const activeGroupId = activeId.replace('group-', '') as LayerGroup;
      const overGroupId = overId.replace('group-', '') as LayerGroup;

      if (activeGroupId !== overGroupId) {
        const oldIndex = layerOrder.groupOrder.indexOf(activeGroupId);
        const newIndex = layerOrder.groupOrder.indexOf(overGroupId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newGroupOrder = arrayMove(layerOrder.groupOrder, oldIndex, newIndex);
          setGroupOrder(newGroupOrder);
        }
      }
    } else if (dragContext === 'layer') {
      // Reordering layers within a group
      const activeLayerIdClean = activeId.replace('layer-', '');
      const overLayerIdClean = overId.replace('layer-', '');

      // Find which group the active layer belongs to
      let activeGroupId: LayerGroup | null = null;
      for (const groupId of layerOrder.groupOrder) {
        if (layerOrder.layerOrderByGroup[groupId]?.includes(activeLayerIdClean)) {
          activeGroupId = groupId;
          break;
        }
      }

      if (activeGroupId && activeLayerIdClean !== overLayerIdClean) {
        const layerIds = layerOrder.layerOrderByGroup[activeGroupId];
        const oldIndex = layerIds.indexOf(activeLayerIdClean);
        const newIndex = layerIds.indexOf(overLayerIdClean);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newLayerOrder = arrayMove(layerIds, oldIndex, newIndex);
          setLayerOrderInGroup(activeGroupId, newLayerOrder);
        }
      }
    }

    setActiveGroupId(null);
    setActiveLayerId(null);
    setDragContext(null);
  };

  // Find active group or layer data for overlay
  const activeGroup = activeGroupId
    ? groups.find((g) => g.id === activeGroupId)
    : null;

  let activeLayer: LayerConfig | null = null;
  if (activeLayerId) {
    for (const groupId of layerOrder.groupOrder) {
      const layers = getLayersByGroupCustomOrder(groupId, layerOrder);
      const found = layers.find((l) => l.id === activeLayerId);
      if (found) {
        activeLayer = found;
        break;
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={groups.map((g) => `group-${g.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {groups.map((group) => (
          <SortableGroup
            key={group.id}
            groupId={group.id as LayerGroup}
            groupName={group.name}
            groupColor={group.color}
            layers={getLayersByGroupCustomOrder(group.id as LayerGroup, layerOrder)}
            activeLayers={activeLayers}
            onToggle={toggleLayer}
            onIsolate={onIsolate}
            isolatedLayerId={isolatedLayerId}
            layerOrder={layerOrder}
          />
        ))}
      </SortableContext>

      <DragOverlay>
        {activeGroup && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '2px',
                backgroundColor: `rgb(${activeGroup.color.join(',')})`,
              }}
            />
            <span style={{ fontWeight: '600', fontSize: '12px', color: 'white' }}>
              {activeGroup.name}
            </span>
          </div>
        )}
        {activeLayer && (
          <div
            style={{
              padding: '4px 8px',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: `rgba(${activeLayer.style.fillColor.slice(0, 3).join(',')}, 1)`,
              }}
            />
            <span style={{ fontSize: '11px', color: 'white' }}>{activeLayer.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface SortableGroupProps {
  groupId: LayerGroup;
  groupName: string;
  groupColor: [number, number, number];
  layers: LayerConfig[];
  activeLayers: string[];
  onToggle: (id: string) => void;
  onIsolate: (id: string | null) => void;
  isolatedLayerId: string | null;
  layerOrder: LayerOrderConfig;
}

function SortableGroup({
  groupId,
  groupName,
  groupColor,
  layers,
  activeLayers,
  onToggle,
  onIsolate,
  isolatedLayerId,
}: SortableGroupProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `group-${groupId}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const activeCount = layers.filter((l) => activeLayers.includes(l.id)).length;

  return (
    <div ref={setNodeRef} style={{ ...style, marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '6px',
          paddingBottom: '4px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <button
          {...attributes}
          {...listeners}
          style={{
            background: 'none',
            border: 'none',
            padding: '2px 4px',
            cursor: 'grab',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Drag to reorder group"
        >
          &#x2630;
        </button>
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '2px',
            backgroundColor: `rgb(${groupColor.join(',')})`,
          }}
        />
        <span style={{ fontWeight: '600', fontSize: '12px' }}>{groupName}</span>
        <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: 'auto' }}>
          {activeCount}/{layers.length}
        </span>
      </div>

      <SortableContext
        items={layers.map((l) => `layer-${l.id}`)}
        strategy={verticalListSortingStrategy}
      >
        {layers.map((layer) => (
          <SortableLayerItem
            key={layer.id}
            layer={layer}
            isActive={activeLayers.includes(layer.id)}
            isIsolated={isolatedLayerId === layer.id}
            onToggle={onToggle}
            onIsolate={onIsolate}
          />
        ))}
      </SortableContext>
    </div>
  );
}

interface SortableLayerItemProps {
  layer: LayerConfig;
  isActive: boolean;
  isIsolated: boolean;
  onToggle: (id: string) => void;
  onIsolate: (id: string | null) => void;
}

function SortableLayerItem({
  layer,
  isActive,
  isIsolated,
  onToggle,
  onIsolate,
}: SortableLayerItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `layer-${layer.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isActive ? 1 : 0.5,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 0 4px 12px',
      }}
    >
      <button
        {...attributes}
        {...listeners}
        style={{
          background: 'none',
          border: 'none',
          padding: '2px 4px',
          cursor: 'grab',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '10px',
          display: 'flex',
          alignItems: 'center',
        }}
        title="Drag to reorder layer"
      >
        &#x2630;
      </button>
      <input
        type="checkbox"
        checked={isActive}
        onChange={() => onToggle(layer.id)}
        style={{ cursor: 'pointer' }}
      />
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: `rgba(${layer.style.fillColor.slice(0, 3).join(',')}, 1)`,
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: '11px',
          cursor: 'pointer',
        }}
        onClick={() => onToggle(layer.id)}
      >
        {layer.name}
      </span>
      {isActive && (
        <button
          onClick={() => onIsolate(isIsolated ? null : layer.id)}
          style={{
            padding: '2px 6px',
            fontSize: '9px',
            backgroundColor: isIsolated ? '#D94A4A' : 'rgba(255,255,255,0.1)',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
          }}
          title={isIsolated ? 'Clear isolation' : 'Isolate layer'}
        >
          {isIsolated ? 'SOLO' : 'solo'}
        </button>
      )}
    </div>
  );
}
