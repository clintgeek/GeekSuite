import { GeekButton } from '../primitives/index.js';

export function GlobalSearchButton({ children = 'Search', ...props }) {
  return (
    <GeekButton variant="outlined" {...props}>
      {children}
    </GeekButton>
  );
}

