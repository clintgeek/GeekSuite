import { GeekButton } from '../primitives/index.js';
import { useFocusMode } from '../focus/index.js';

export function FocusModeToggle({
  enterLabel = 'Focus',
  exitLabel = 'Exit focus',
  ...props
}) {
  const { focusMode, toggleFocusMode } = useFocusMode();

  return (
    <GeekButton variant="text" onClick={toggleFocusMode} {...props}>
      {focusMode ? exitLabel : enterLabel}
    </GeekButton>
  );
}

