import { GeekButton } from '../primitives/index.js';

export function QuickCaptureButton({ children = 'Capture', ...props }) {
  return (
    <GeekButton variant="contained" {...props}>
      {children}
    </GeekButton>
  );
}

