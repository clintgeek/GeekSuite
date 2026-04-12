import { useCallback } from 'react';
import { Box } from '@mui/material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SectionHeader from '../shared/SectionHeader';
import TaskRow from '../tasks/TaskRow';
import EmptyState from '../shared/EmptyState';

/**
 * SortableTaskRow — thin wrapper that makes a TaskRow draggable.
 * The drag handle is the entire row (press-and-hold on mobile,
 * click-and-drag on desktop). Uses CSS transform for smooth movement.
 */
const SortableTaskRow = ({ task, focused, ...taskRowProps }) => {
  const taskId = task.id || task._id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: taskId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
    position: 'relative',
  };

  return (
    <Box ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskRow
        task={task}
        focused={focused}
        {...taskRowProps}
      />
    </Box>
  );
};

/**
 * TodaySection — the primary task list with drag-and-drop reorder.
 *
 * Tasks are wrapped in @dnd-kit's SortableContext. On drag end, the
 * reordered array is passed to `onReorder(reorderedTasks)` which the
 * parent uses to update local state and persist via saveDailyOrder.
 */
const TodaySection = ({
  tasks,
  onStatusToggle,
  onEdit,
  onDelete,
  onSaveAsNote,
  focusedTaskId,
  onReorder,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = tasks.findIndex((t) => (t.id || t._id) === active.id);
      const newIndex = tasks.findIndex((t) => (t.id || t._id) === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(tasks, oldIndex, newIndex);
      onReorder?.(reordered);
    },
    [tasks, onReorder]
  );

  if (!tasks || tasks.length === 0) {
    return (
      <EmptyState
        title="A clean page"
        description="Use the field above to begin planning your day."
      />
    );
  }

  const taskIds = tasks.map((t) => t.id || t._id);

  return (
    <Box>
      <SectionHeader title="Today" count={tasks.length} size="display" />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          <Box
            sx={{
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {tasks.map((task) => (
              <SortableTaskRow
                key={task.id || task._id}
                task={task}
                onStatusToggle={onStatusToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onSaveAsNote={onSaveAsNote}
                focused={focusedTaskId === (task.id || task._id)}
              />
            ))}
          </Box>
        </SortableContext>
      </DndContext>
    </Box>
  );
};

export default TodaySection;
