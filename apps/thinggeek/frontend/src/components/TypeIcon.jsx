/** A type's glyph by its stored icon name. Decorative unless given a `title`. */
import React from 'react';
import { typeIconFor } from './typeIcons';

export default function TypeIcon({ name, title, sx, fontSize }) {
  const Icon = typeIconFor(name);
  return <Icon titleAccess={title} aria-hidden={title ? undefined : 'true'} fontSize={fontSize} sx={sx} />;
}
