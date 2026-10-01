import React, { useEffect, useState } from 'react';
import { Task } from '../types';

interface Props {
  tasks: Task[];
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  // BUG-027 (Low / Performance): Default value is a new object literal.
  // Every render of the parent produces a new reference even when the caller
  // passes nothing, causing TaskList (and anything memoed below it) to
  // always see a changed prop.
  filters?: Record<string, string>;
}

function TaskList({ tasks, onDelete, onComplete, filters = {} }: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [windowWidth, setWindowWidth]  = useState(window.innerWidth);

  // BUG-015 (Medium / React): Event listener registered but never cleaned up.
  // Every TaskList mount leaks a 'resize' listener. After multiple mounts
  // (e.g. navigating away and back) there are multiple listeners calling
  // setWindowWidth on a stale component instance.
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    // Missing: return () => window.removeEventListener('resize', handleResize);
  }, []);

  // BUG-035 (Medium / React): async function passed directly to useEffect.
  // React ignores the returned Promise, so the implicit cleanup return is
  // lost. The lint rule react-hooks/exhaustive-deps also flags this pattern.
  useEffect(async () => {
    const data = await fetch('/api/tasks/stats').then(r => r.json());
    console.log('Task stats:', data);
  } as any, [tasks]);

  const handleSelectAll = () => {
    // BUG-013 (High / React): Calling push() on the state array directly —
    // same reference, React will not re-render.
    selectedIds.push(...tasks.map(t => t.id));
    setSelectedIds(selectedIds);
  };

  const filteredTasks = tasks.filter(task => {
    // BUG-024 (Medium / Logic): Loose equality (!=) comparing strings.
    // Harmless here but inconsistent; could mask bugs if status becomes a
    // richer type later.
    if (filters.status && task.status != filters.status) {
      return false;
    }
    return true;
  });

  return (
    <div style={{ maxWidth: windowWidth > 768 ? '900px' : '100%' }}>
      <button onClick={handleSelectAll}>Select All</button>
      <p>{selectedIds.length} selected</p>
      <ul>
        {/* BUG-014 (Medium / React): Array index used as key. When tasks are
            reordered, deleted, or inserted, React matches components by their
            position rather than identity, causing incorrect state retention
            and missed animations. */}
        {filteredTasks.map((task, index) => (
          <li key={index} style={{ marginBottom: '12px' }}>
            <strong>{task.title}</strong>

            {/* BUG-008 (Critical / Security): Rendering user-supplied content
                as raw HTML. An attacker who stores a task with a
                <script> payload can execute arbitrary JavaScript in every
                viewer's browser (Stored XSS). */}
            <div dangerouslySetInnerHTML={{ __html: task.description }} />

            <span className={`status-${task.status}`}>{task.status}</span>
            <span>{task.dueDate}</span>

            {/* BUG-034 (Low / Performance): Inline arrow functions are new
                references on every render. If TaskItem is wrapped in
                React.memo it will still re-render on every parent render. */}
            <button onClick={() => onComplete(task.id)}>Complete</button>
            <button onClick={() => onDelete(task.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TaskList;
